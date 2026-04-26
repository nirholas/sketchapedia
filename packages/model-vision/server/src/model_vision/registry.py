"""Warm singletons for the heavy model adapters."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from .config import Settings, settings
from .detectors import OpenVocabularyDetector, PhraseGrounder, RegionSegmenter
from .telemetry import get_logger, metrics

log = get_logger(__name__)


@dataclass
class Adapters:
    grounder: PhraseGrounder | None
    open_vocab: OpenVocabularyDetector | None
    segmenter: RegionSegmenter | None


class Registry:
    def __init__(self) -> None:
        self._adapters: Adapters | None = None
        self._lock = asyncio.Lock()

    async def ensure_loaded(self, s: Settings | None = None) -> Adapters:
        if self._adapters is not None:
            return self._adapters
        async with self._lock:
            if self._adapters is not None:
                return self._adapters
            self._adapters = await asyncio.to_thread(_load, s or settings())
            metrics().set_gauge("model_loaded", 1.0)
            return self._adapters

    def current(self) -> Adapters | None:
        return self._adapters

    def set_for_test(self, adapters: Adapters) -> None:
        self._adapters = adapters

    async def shutdown(self) -> None:
        self._adapters = None
        metrics().set_gauge("model_loaded", 0.0)


def _load(s: Settings) -> Adapters:
    from .florence import Florence2
    from .grounding_dino import GroundingDINO
    f = Florence2(s)
    return Adapters(grounder=f, open_vocab=GroundingDINO(s), segmenter=f)


_REGISTRY = Registry()


def registry() -> Registry:
    return _REGISTRY
