"""Label-similarity + Hungarian assignment for draft→detection pairing."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from rapidfuzz import fuzz
from scipy.optimize import linear_sum_assignment

from .geometry import XYXY, bbox_iou


@dataclass(frozen=True)
class Draft:
    id: str
    label: str
    bbox: XYXY


@dataclass(frozen=True)
class Detection:
    phrase: str
    bbox: XYXY
    score: float


@dataclass(frozen=True)
class Match:
    draft_id: str
    detection_index: int | None
    similarity: float
    score: float


_LABEL_W = 0.75
_SPATIAL_W = 0.25
_MIN_SIM = 0.45


def _label_sim(a: str, b: str) -> float:
    a, b = (a or "").strip().lower(), (b or "").strip().lower()
    if not a or not b:
        return 0.0
    return max(fuzz.token_set_ratio(a, b), fuzz.partial_ratio(a, b), fuzz.WRatio(a, b)) / 100.0


def assign(
    drafts: list[Draft],
    detections: list[Detection],
    *,
    min_similarity: float = _MIN_SIM,
) -> list[Match]:
    if not drafts:
        return []
    if not detections:
        return [Match(d.id, None, 0.0, 0.0) for d in drafts]

    n, m = len(drafts), len(detections)
    cost = np.ones((max(n, m), max(n, m)), dtype=np.float64)
    sims = np.zeros((n, m), dtype=np.float64)
    combined = np.zeros((n, m), dtype=np.float64)

    for i, d in enumerate(drafts):
        for j, det in enumerate(detections):
            s = _label_sim(d.label, det.phrase)
            sims[i, j] = s
            combined[i, j] = _LABEL_W * s + _SPATIAL_W * bbox_iou(d.bbox, det.bbox)

    cost[:n, :m] = 1.0 - combined
    _, col_ind = linear_sum_assignment(cost)

    matches: list[Match] = []
    for i in range(n):
        j = int(col_ind[i])
        if j >= m or float(sims[i, j]) < min_similarity:
            matches.append(Match(drafts[i].id, None, float(sims[i, j]) if j < m else 0.0, 0.0))
        else:
            matches.append(Match(drafts[i].id, j, float(sims[i, j]), float(combined[i, j])))
    return matches


def compose_grounding_caption(labels: list[str]) -> str:
    return "; ".join(lbl.strip() for lbl in labels if lbl and lbl.strip())
