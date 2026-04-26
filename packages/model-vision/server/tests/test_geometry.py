"""Geometry primitive tests."""

from __future__ import annotations

import pytest

from model_vision.geometry import (
    XYXY,
    bbox_iou,
    clip_polygon,
    overlap_ratio,
    polygon_bbox,
    resolve_overlaps,
)


def test_iou_identical_boxes_is_one() -> None:
    a = XYXY(0, 0, 100, 100)
    assert bbox_iou(a, a) == pytest.approx(1.0)


def test_iou_disjoint_boxes_is_zero() -> None:
    a = XYXY(0, 0, 10, 10)
    b = XYXY(100, 100, 110, 110)
    assert bbox_iou(a, b) == 0.0


def test_iou_half_overlap() -> None:
    a = XYXY(0, 0, 10, 10)
    b = XYXY(5, 0, 15, 10)
    assert bbox_iou(a, b) == pytest.approx(1 / 3)


def test_overlap_ratio_smaller_box_bias() -> None:
    big = XYXY(0, 0, 100, 100)
    small = XYXY(10, 10, 40, 40)
    assert overlap_ratio(big, small) == pytest.approx(1.0)


def test_clip_to_canvas_bounds() -> None:
    box = XYXY(-20, -20, 50, 50).clip_to(100, 100)
    assert box.x1 == 0.0 and box.y1 == 0.0
    assert box.x2 == 50.0 and box.y2 == 50.0


def test_clip_preserves_positive_area_off_canvas() -> None:
    box = XYXY(200, 200, 300, 300).clip_to(100, 100)
    assert box.width >= 1 and box.height >= 1


def test_round_int() -> None:
    box = XYXY(1.4, 2.6, 10.1, 20.5).round_int()
    assert (box.x1, box.y1, box.x2, box.y2) == (1, 3, 10, 20)


def test_polygon_bbox() -> None:
    bb = polygon_bbox([(10, 10), (40, 20), (30, 60), (0, 30)])
    assert (bb.x1, bb.y1, bb.x2, bb.y2) == (0, 10, 40, 60)


def test_clip_polygon_to_canvas() -> None:
    poly = [(-10, 50), (200, 50), (200, 150), (-10, 150)]
    clipped = clip_polygon(poly, 100, 100)
    xs = [p[0] for p in clipped]
    ys = [p[1] for p in clipped]
    assert min(xs) >= 0 and max(xs) <= 100
    assert min(ys) >= 0 and max(ys) <= 100


def test_clip_polygon_fallback_for_offscreen() -> None:
    poly = [(500, 500), (600, 500), (600, 600)]
    clipped = clip_polygon(poly, 100, 100)
    assert len(clipped) >= 3


def test_resolve_overlaps_shrinks_lower_confidence_box() -> None:
    a = ("a", XYXY(0, 0, 100, 100), 0.95)
    b = ("b", XYXY(50, 0, 150, 100), 0.70)
    resolved = resolve_overlaps([a, b], max_overlap=0.10)
    boxes = {item_id: box for item_id, box, _ in resolved}
    assert boxes["a"] == XYXY(0, 0, 100, 100)
    assert overlap_ratio(boxes["a"], boxes["b"]) <= 0.10 + 1e-6
    assert boxes["b"].area > 0


def test_resolve_overlaps_noop_when_no_conflict() -> None:
    a = ("a", XYXY(0, 0, 50, 50), 0.9)
    b = ("b", XYXY(100, 100, 150, 150), 0.9)
    resolved = resolve_overlaps([a, b], max_overlap=0.10)
    assert [r[1] for r in resolved] == [a[1], b[1]]


def test_iou_xywh_equivalence() -> None:
    a = XYXY.from_xywh(10, 10, 40, 40)
    b = XYXY(10, 10, 50, 50)
    assert bbox_iou(a, b) == pytest.approx(1.0)
