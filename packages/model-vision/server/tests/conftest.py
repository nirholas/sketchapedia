"""Shared test fixtures — pure-Python, no GPU."""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from PIL import Image

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from model_vision.detectors import PolygonPrediction  # noqa: E402
from model_vision.geometry import XYXY  # noqa: E402
from model_vision.matching import Detection  # noqa: E402


@dataclass
class FakeGrounder:
    """Deterministic phrase grounder — a real implementation of PhraseGrounder."""
    name: str = "fake-grounder"
    answers: dict[str, XYXY] = field(default_factory=dict)
    score: float = 0.9
    calls: int = 0

    def ground(self, image: Image.Image, caption: str) -> list[Detection]:
        self.calls += 1
        cl = caption.lower()
        return [Detection(phrase=p, bbox=b, score=self.score)
                for p, b in self.answers.items() if p.lower() in cl]


@dataclass
class FakeOpenVocab:
    """Deterministic open-vocabulary detector."""
    name: str = "fake-openvocab"
    answers: dict[str, XYXY] = field(default_factory=dict)
    score: float = 0.88
    calls: int = 0

    def detect(self, image: Image.Image, label: str) -> list[Detection]:
        self.calls += 1
        box = self.answers.get(label.lower())
        return [] if box is None else [Detection(phrase=label, bbox=box, score=self.score)]


@dataclass
class FakeSegmenter:
    """Deterministic polygon segmenter."""
    name: str = "fake-segmenter"
    polygons: dict[tuple[int, int, int, int], list[tuple[float, float]]] = field(default_factory=dict)
    calls: int = 0

    def segment(self, image: Image.Image, bbox: tuple[float, float, float, float]) -> PolygonPrediction | None:
        self.calls += 1
        key: tuple[int, int, int, int] = tuple(int(round(v)) for v in bbox)  # type: ignore[assignment]
        x, y, w, h = bbox
        pts = self.polygons.get(key) or [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        return PolygonPrediction(points=list(pts), score=0.95)


@pytest.fixture
def blank_image() -> Image.Image:
    return Image.new("RGB", (1920, 1080), color=(250, 250, 250))
