"""Label-similarity and Hungarian assignment tests."""

from __future__ import annotations

from model_vision.geometry import XYXY
from model_vision.matching import Detection, Draft, assign, compose_grounding_caption


def test_compose_caption_joins_semicolons() -> None:
    assert compose_grounding_caption(["a blue button", "timeline", "menu"]) == \
        "a blue button; timeline; menu"


def test_compose_caption_drops_empties() -> None:
    assert compose_grounding_caption(["", "  ", "hello"]) == "hello"


def test_assign_matches_by_label_similarity() -> None:
    drafts = [
        Draft("a", "blue reserve button", XYXY(10, 10, 50, 40)),
        Draft("b", "availability timeline", XYXY(100, 100, 400, 120)),
    ]
    detections = [
        Detection("a timeline of availability", XYXY(102, 98, 402, 122), 0.85),
        Detection("blue reserve button", XYXY(12, 11, 52, 41), 0.90),
    ]
    matches = assign(drafts, detections)
    by_id = {m.draft_id: m.detection_index for m in matches}
    assert by_id["a"] == 1
    assert by_id["b"] == 0


def test_assign_returns_none_below_threshold() -> None:
    drafts = [Draft("a", "blue reserve button", XYXY(10, 10, 50, 40))]
    detections = [Detection("unrelated thing", XYXY(200, 200, 300, 300), 0.9)]
    assert assign(drafts, detections)[0].detection_index is None


def test_assign_pads_unmatched_when_fewer_detections() -> None:
    drafts = [
        Draft("a", "reserve button", XYXY(0, 0, 10, 10)),
        Draft("b", "menu image", XYXY(20, 20, 40, 40)),
    ]
    detections = [Detection("reserve button", XYXY(0, 0, 10, 10), 0.9)]
    matches = assign(drafts, detections)
    assert {m.draft_id for m in matches if m.detection_index is not None} == {"a"}
    assert {m.draft_id for m in matches if m.detection_index is None} == {"b"}


def test_assign_uses_spatial_tiebreaker_with_duplicate_labels() -> None:
    drafts = [Draft("L", "cell", XYXY(0, 0, 50, 50)), Draft("R", "cell", XYXY(500, 0, 550, 50))]
    dets = [Detection("cell", XYXY(2, 1, 52, 49), 0.9), Detection("cell", XYXY(498, 1, 548, 49), 0.9)]
    matches = assign(drafts, dets)
    by_id = {m.draft_id: m.detection_index for m in matches}
    assert by_id["L"] == 0
    assert by_id["R"] == 1


def test_assign_empty_inputs() -> None:
    assert assign([], []) == []
    assert assign([Draft("a", "foo", XYXY(0, 0, 1, 1))], [])[0].detection_index is None
