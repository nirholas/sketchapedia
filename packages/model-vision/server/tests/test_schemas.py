"""Schema validation tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from model_vision.schemas import (
    BBox,
    GroundRequest,
    Hitmap,
    HitmapItem,
    RegionBBox,
    Viewport,
)


def _draft() -> Hitmap:
    return Hitmap(
        items=[HitmapItem(id="a", region=RegionBBox(bbox=BBox(x=0, y=0, w=10, h=10)), aria_label="x")],
        viewport=Viewport(width=100, height=100),
    )


def test_bbox_positive_dimensions() -> None:
    with pytest.raises(ValidationError):
        BBox(x=0, y=0, w=0, h=10)
    with pytest.raises(ValidationError):
        BBox(x=0, y=0, w=10, h=-1)


def test_polygon_min_three_points() -> None:
    from model_vision.schemas import RegionPolygon
    with pytest.raises(ValidationError):
        RegionPolygon(polygon=[(0, 0), (1, 1)])


def test_ground_request_url_or_b64_required() -> None:
    GroundRequest(keyframe_url="https://example/k.webp", hitmap_draft=_draft())
    GroundRequest(keyframe_b64="aGVsbG8=", hitmap_draft=_draft())
    with pytest.raises(ValidationError):
        GroundRequest(hitmap_draft=_draft())
    with pytest.raises(ValidationError):
        GroundRequest(keyframe_url="https://example/k.webp", keyframe_b64="aGVsbG8=", hitmap_draft=_draft())


def test_camelcase_aliases_on_wire() -> None:
    req = GroundRequest(keyframe_url="https://example/k.webp", hitmap_draft=_draft(), deadline_ms=300)
    dumped = req.model_dump(by_alias=True)
    assert "keyframeUrl" in dumped
    assert "hitmapDraft" in dumped
    assert dumped["deadlineMs"] == 300
    assert dumped["hitmapDraft"]["items"][0]["ariaLabel"] == "x"


def test_deadline_bounds() -> None:
    with pytest.raises(ValidationError):
        GroundRequest(keyframe_url="https://x", hitmap_draft=_draft(), deadline_ms=1)
    with pytest.raises(ValidationError):
        GroundRequest(keyframe_url="https://x", hitmap_draft=_draft(), deadline_ms=100_000)
