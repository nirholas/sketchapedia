"""Core correction algorithm — framework-agnostic orchestration."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from PIL.Image import Image

from .deadline import Deadline, DeadlineExceeded
from .detectors import OpenVocabularyDetector, PhraseGrounder, RegionSegmenter
from .geometry import XYXY, bbox_iou, clip_polygon, resolve_overlaps
from .matching import Detection, Draft, assign, compose_grounding_caption
from .schemas import (
    BBox,
    CorrectionDiagnostic,
    Diagnostics,
    Hitmap,
    HitmapItem,
    RegionBBox,
    RegionPolygon,
)

ACCEPT_IOU = 0.50
MAX_OVERLAP = 0.10


@dataclass(frozen=True)
class CorrectionConfig:
    accept_iou: float = ACCEPT_IOU
    max_overlap: float = MAX_OVERLAP
    min_phrase_score: float = 0.30
    segment_polygons: bool = True
    escalate_on_miss: bool = True


@dataclass
class CorrectionResult:
    hitmap: Hitmap
    diagnostics: Diagnostics


@dataclass
class _State:
    item: HitmapItem
    draft_bbox: XYXY
    is_polygon: bool
    corrected_bbox: XYXY
    corrected_polygon: list[tuple[float, float]] | None = None
    confidence: float = 0.0
    iou: float = 0.0
    accepted: bool = False
    escalated: bool = False
    matched_phrase: str | None = None
    extras: dict = field(default_factory=dict)


def _as_xyxy(item: HitmapItem) -> tuple[XYXY, bool]:
    r = item.region
    if isinstance(r, RegionBBox):
        bb = r.bbox
        return XYXY(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h), False
    xs, ys = [p[0] for p in r.polygon], [p[1] for p in r.polygon]
    return XYXY(min(xs), min(ys), max(xs), max(ys)), True


def _label(item: HitmapItem) -> str:
    return item.aria_label or item.aria_summary or item.role.value


def correct_hitmap(
    *,
    image: Image,
    draft: Hitmap,
    grounder: PhraseGrounder | None,
    open_vocab: OpenVocabularyDetector | None,
    segmenter: RegionSegmenter | None,
    config: CorrectionConfig = CorrectionConfig(),
    deadline: Deadline | None = None,
    keyframe_hash: str | None = None,
) -> CorrectionResult:
    deadline = deadline or Deadline.never()
    w, h = draft.viewport.width, draft.viewport.height

    states = [
        _State(item=it, draft_bbox=(bb := _as_xyxy(it)[0]).clip_to(w, h),
               is_polygon=_as_xyxy(it)[1], corrected_bbox=bb.clip_to(w, h))
        for it in draft.items
    ]
    # Recompute cleanly to avoid double-call to _as_xyxy:
    states = []
    for it in draft.items:
        bb, is_poly = _as_xyxy(it)
        bb = bb.clip_to(w, h)
        states.append(_State(item=it, draft_bbox=bb, is_polygon=is_poly, corrected_bbox=bb))

    deadline_hit = deadline.expired()

    # Step 1+2: batched phrase grounding + Hungarian match.
    if grounder is not None and not deadline_hit:
        try:
            caption = compose_grounding_caption([_label(s.item) for s in states])
            if caption:
                dets = [d for d in grounder.ground(image, caption) if d.score >= config.min_phrase_score]
                _apply_grounding(states, dets, config)
        except DeadlineExceeded:
            deadline_hit = True

    # Step 5: escalate misses.
    if not deadline_hit and config.escalate_on_miss and open_vocab is not None:
        for s in states:
            if s.accepted or deadline.expired():
                deadline_hit = deadline.expired()
                break
            try:
                _escalate(s, image, open_vocab, config)
            except DeadlineExceeded:
                deadline_hit = True
                break

    # Step 3: polygon refinement.
    if not deadline_hit and config.segment_polygons and segmenter is not None:
        for s in states:
            if not s.is_polygon or not s.accepted:
                continue
            if deadline.expired():
                deadline_hit = True
                break
            try:
                poly = segmenter.segment(image, s.corrected_bbox.as_xywh())
            except DeadlineExceeded:
                deadline_hit = True
                break
            if poly and len(poly.points) >= 3:
                s.corrected_polygon = clip_polygon(poly.points, w, h)

    # Step 6: overlap resolution.
    accepted = [(s.item.id, s.corrected_bbox, s.confidence) for s in states if s.accepted]
    if len(accepted) >= 2:
        resolved = resolve_overlaps(accepted, max_overlap=config.max_overlap)
        by_id = {rid: rbox for rid, rbox, _ in resolved}
        for s in states:
            if s.accepted and s.item.id in by_id and by_id[s.item.id] != s.corrected_bbox:
                s.corrected_bbox = by_id[s.item.id]
                s.corrected_polygon = None

    for s in states:
        s.corrected_bbox = s.corrected_bbox.clip_to(w, h)

    corrected = [_finalize(s, w, h) for s in states]
    new_hitmap = draft.model_copy(update={"items": corrected})
    diag = _diagnostics(states, deadline_hit=deadline_hit, elapsed_ms=deadline.elapsed_ms(), kh=keyframe_hash or "")
    return CorrectionResult(hitmap=new_hitmap, diagnostics=diag)


def _apply_grounding(states: list[_State], dets: list[Detection], cfg: CorrectionConfig) -> None:
    drafts = [Draft(id=s.item.id, label=_label(s.item), bbox=s.draft_bbox) for s in states]
    for s, m in zip(states, assign(drafts, dets), strict=True):
        if m.detection_index is None:
            continue
        det = dets[m.detection_index]
        iou = bbox_iou(s.draft_bbox, det.bbox)
        s.iou = iou
        s.matched_phrase = det.phrase
        s.confidence = min(1.0, det.score * (0.5 + 0.5 * m.similarity))
        if iou >= cfg.accept_iou:
            s.corrected_bbox = det.bbox
            s.accepted = True


def _escalate(s: _State, image: Image, ov: OpenVocabularyDetector, cfg: CorrectionConfig) -> None:
    dets = ov.detect(image, _label(s.item))
    s.escalated = True
    if not dets:
        return
    det = max(dets, key=lambda d: bbox_iou(s.draft_bbox, d.bbox) * d.score)
    iou = bbox_iou(s.draft_bbox, det.bbox)
    if det.score < cfg.min_phrase_score:
        return
    if iou >= cfg.accept_iou:
        s.corrected_bbox, s.iou, s.confidence, s.accepted, s.matched_phrase = (
            det.bbox, iou, det.score, True, det.phrase
        )
    elif det.score > s.confidence:
        s.iou = max(s.iou, iou)
        s.confidence = det.score
        s.matched_phrase = det.phrase


def _finalize(s: _State, w: int, h: int) -> HitmapItem:
    if s.is_polygon and s.corrected_polygon:
        region = RegionPolygon(polygon=[(float(x), float(y)) for x, y in clip_polygon(s.corrected_polygon, w, h)])
    elif s.is_polygon and not s.accepted:
        region = s.item.region
    else:
        r = s.corrected_bbox.clip_to(w, h).round_int()
        x, y, rw, rh = r.as_xywh()
        region = RegionBBox(bbox=BBox(x=x, y=y, w=max(1.0, rw), h=max(1.0, rh)))
    return s.item.model_copy(update={"region": region, "confidence": round(s.confidence, 4),
                                     "low_confidence": not s.accepted or s.confidence < 0.5})


def _diagnostics(states: list[_State], *, deadline_hit: bool, elapsed_ms: float, kh: str) -> Diagnostics:
    n = max(1, len(states))
    return Diagnostics(
        mean_confidence=round(sum(s.confidence for s in states) / n, 4),
        mean_iou=round(sum(s.iou for s in states) / n, 4),
        match_rate=round(sum(1 for s in states if s.matched_phrase is not None) / n, 4),
        escalation_rate=round(sum(1 for s in states if s.escalated) / n, 4),
        deadline_hit=deadline_hit,
        latency_ms=round(elapsed_ms, 3),
        corrections=[CorrectionDiagnostic(id=s.item.id, iou=round(s.iou, 4),
                     confidence=round(s.confidence, 4), accepted=s.accepted,
                     escalated=s.escalated, matched_phrase=s.matched_phrase) for s in states],
        keyframe_hash=kh,
    )


def keyframe_digest(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()
