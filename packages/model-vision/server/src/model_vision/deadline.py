"""Monotonic deadline helper for the 500ms hard cap."""

from __future__ import annotations

import time
from dataclasses import dataclass, field


class DeadlineExceeded(Exception):
    pass


@dataclass
class Deadline:
    total_ms: float
    started: float = field(default_factory=time.monotonic)

    @classmethod
    def starting_now(cls, total_ms: float) -> "Deadline":
        return cls(total_ms=total_ms, started=time.monotonic())

    @classmethod
    def never(cls) -> "Deadline":
        return cls(total_ms=float("inf"), started=time.monotonic())

    def elapsed_ms(self) -> float:
        return (time.monotonic() - self.started) * 1000.0

    def remaining_ms(self) -> float:
        return float("inf") if self.total_ms == float("inf") else max(0.0, self.total_ms - self.elapsed_ms())

    def expired(self) -> bool:
        return self.remaining_ms() <= 0.0

    def check(self) -> None:
        if self.expired():
            raise DeadlineExceeded(f"deadline of {self.total_ms:.1f}ms exceeded")
