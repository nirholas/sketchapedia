"""Detector protocol: the narrow interface needed by the correction algorithm."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from PIL.Image import Image

from .matching import Detection


@dataclass(frozen=True)
class PolygonPrediction:
    points: list[tuple[float, float]]
    score: float


@runtime_checkable
class PhraseGrounder(Protocol):
    name: str

    def ground(self, image: Image, caption: str) -> list[Detection]:
        ...


@runtime_checkable
class OpenVocabularyDetector(Protocol):
    name: str

    def detect(self, image: Image, label: str) -> list[Detection]:
        ...


@runtime_checkable
class RegionSegmenter(Protocol):
    name: str

    def segment(self, image: Image, bbox: tuple[float, float, float, float]) -> PolygonPrediction | None:
        ...
