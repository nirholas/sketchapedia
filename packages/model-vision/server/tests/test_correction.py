"""End-to-end correction algorithm tests — no GPU needed."""

from __future__ import annotations

import time

import pytest
from PIL import Image

from model_vision.correction import CorrectionConfig, correct_hitmap
from model_vision.deadline import Deadline
from model_vision.geometry import XYXY, bbox_iou, overlap_ratio
from model_vision.schemas import BBox, Hitmap, HitmapItem, RegionBBox, RegionPolygon, Viewport

from conftest import FakeGrounder, FakeOpenVocab, FakeSegmenter


def _bi(id_: str, x: float, y: float, w: float, h: float, label: str) -> HitmapItem:
    return HitmapItem(id=id_, region=RegionBBox(bbox=BBox(x=x, y=y, w=w, h=h)),
                      role="button", aria_label=label)


def _pi(id_: str, pts: list[tuple[float, float]], label: str) -> HitmapItem:
    return HitmapItem(id=id_, region=RegionPolygon(polygon=pts), role="region", aria_label=label)


def _hm(items: list[HitmapItem], w: int = 1920, h: int = 1080) -> Hitmap:
    return Hitmap(items=items, viewport=Viewport(width=w, height=h))


def test_correction_improves_iou(blank_image: Image.Image) -> None:
    draft = _hm([_bi("btn", 100, 100, 200, 80, "blue reserve button"),
                 _bi("tl", 500, 500, 400, 60, "availability timeline")])
    truth = {"blue reserve button": XYXY(118, 112, 318, 192),
              "availability timeline": XYXY(512, 508, 912, 568)}
    result = correct_hitmap(image=blank_image, draft=draft,
                            grounder=FakeGrounder(answers=truth), open_vocab=None, segmenter=None)
    assert result.diagnostics.mean_iou >= 0.5
    bb = result.hitmap.items[0].region
    assert isinstance(bb, RegionBBox)
    got = XYXY.from_xywh(bb.bbox.x, bb.bbox.y, bb.bbox.w, bb.bbox.h)
    assert bbox_iou(got, truth["blue reserve button"]) >= 0.95


def test_low_iou_retains_draft(blank_image: Image.Image) -> None:
    draft = _hm([_bi("btn", 100, 100, 50, 40, "menu image")])
    grounder = FakeGrounder(answers={"menu image": XYXY(900, 900, 1000, 950)})
    result = correct_hitmap(image=blank_image, draft=draft, grounder=grounder,
                            open_vocab=None, segmenter=None)
    bb = result.hitmap.items[0].region
    assert isinstance(bb, RegionBBox)
    assert (bb.bbox.x, bb.bbox.y, bb.bbox.w, bb.bbox.h) == (100, 100, 50, 40)
    assert result.hitmap.items[0].low_confidence is True


def test_escalation_activates_on_miss(blank_image: Image.Image) -> None:
    open_vocab = FakeOpenVocab(answers={"reserve button": XYXY(110, 105, 310, 185)})
    result = correct_hitmap(image=blank_image, draft=_hm([_bi("btn", 100, 100, 200, 80, "reserve button")]),
                            grounder=FakeGrounder(answers={}), open_vocab=open_vocab, segmenter=None)
    assert open_vocab.calls == 1
    assert result.diagnostics.escalation_rate == 1.0
    bb = result.hitmap.items[0].region
    assert isinstance(bb, RegionBBox)
    got = XYXY.from_xywh(bb.bbox.x, bb.bbox.y, bb.bbox.w, bb.bbox.h)
    assert bbox_iou(got, XYXY(110, 105, 310, 185)) >= 0.95


def test_polygon_gets_segmenter_result(blank_image: Image.Image) -> None:
    pts = [(100, 100), (300, 100), (300, 180), (100, 180)]
    truth = XYXY(105, 105, 295, 175)
    refined = [(106, 106), (296, 106), (296, 174), (106, 174)]
    result = correct_hitmap(
        image=blank_image,
        draft=_hm([_pi("p", pts, "navigation ribbon")]),
        grounder=FakeGrounder(answers={"navigation ribbon": truth}),
        open_vocab=None,
        segmenter=FakeSegmenter(polygons={(105, 105, 190, 70): refined}),
    )
    region = result.hitmap.items[0].region
    assert isinstance(region, RegionPolygon)
    assert len(region.polygon) >= 3


def test_overlap_resolved(blank_image: Image.Image) -> None:
    draft = _hm([_bi("a", 0, 0, 100, 100, "left cell"), _bi("b", 80, 0, 100, 100, "right cell")])
    grounder = FakeGrounder(answers={"left cell": XYXY(0, 0, 100, 100), "right cell": XYXY(50, 0, 150, 100)})
    result = correct_hitmap(image=blank_image, draft=draft, grounder=grounder, open_vocab=None, segmenter=None)
    items = {it.id: it for it in result.hitmap.items}
    a_bb = items["a"].region
    b_bb = items["b"].region
    assert isinstance(a_bb, RegionBBox) and isinstance(b_bb, RegionBBox)
    a_box = XYXY.from_xywh(a_bb.bbox.x, a_bb.bbox.y, a_bb.bbox.w, a_bb.bbox.h)
    b_box = XYXY.from_xywh(b_bb.bbox.x, b_bb.bbox.y, b_bb.bbox.w, b_bb.bbox.h)
    assert overlap_ratio(a_box, b_box) <= 0.10 + 1e-6


def test_coords_clipped_to_viewport(blank_image: Image.Image) -> None:
    draft = _hm([_bi("btn", 100, 100, 200, 80, "overflow button")], w=640, h=480)
    grounder = FakeGrounder(answers={"overflow button": XYXY(500, 400, 900, 600)})
    result = correct_hitmap(image=blank_image, draft=draft, grounder=grounder,
                            open_vocab=None, segmenter=None)
    bb = result.hitmap.items[0].region
    assert isinstance(bb, RegionBBox)
    assert bb.bbox.x + bb.bbox.w <= 640
    assert bb.bbox.y + bb.bbox.h <= 480


def test_deadline_blocks_escalation(blank_image: Image.Image) -> None:
    open_vocab = FakeOpenVocab(answers={"reserve button": XYXY(110, 105, 310, 185)})
    deadline = Deadline(total_ms=0.001, started=time.monotonic() - 1.0)  # already expired
    result = correct_hitmap(image=blank_image, draft=_hm([_bi("btn", 100, 100, 200, 80, "reserve button")]),
                            grounder=FakeGrounder(answers={}), open_vocab=open_vocab,
                            segmenter=None, deadline=deadline)
    assert result.diagnostics.deadline_hit is True
    assert open_vocab.calls == 0


def test_diagnostics_fields(blank_image: Image.Image) -> None:
    result = correct_hitmap(
        image=blank_image,
        draft=_hm([_bi("btn", 100, 100, 200, 80, "reserve button")]),
        grounder=FakeGrounder(answers={"reserve button": XYXY(102, 101, 302, 181)}),
        open_vocab=None, segmenter=None, keyframe_hash="sha256:abc",
    )
    d = result.diagnostics
    assert 0.0 <= d.mean_iou <= 1.0
    assert d.match_rate == 1.0
    assert d.escalation_rate == 0.0
    assert d.keyframe_hash == "sha256:abc"
    assert d.corrections[0].accepted is True


@pytest.mark.parametrize("n", [0, 1, 5, 20])
def test_variable_item_counts(blank_image: Image.Image, n: int) -> None:
    items = [_bi(f"i{i}", 10 + i * 50, 10, 40, 40, f"item {i}") for i in range(n)]
    answers = {f"item {i}": XYXY(11 + i * 50, 11, 49 + i * 50, 49) for i in range(n)}
    result = correct_hitmap(image=blank_image, draft=_hm(items),
                            grounder=FakeGrounder(answers=answers), open_vocab=None, segmenter=None)
    assert len(result.hitmap.items) == n
