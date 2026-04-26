"""Structured logging + Prometheus text-format metrics."""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

import structlog


def configure_logging(level: str = "INFO") -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


@dataclass
class Histogram:
    buckets_ms: tuple[float, ...] = (50, 100, 200, 300, 400, 500, 750, 1000, 2000, 5000)
    counts: list[int] = field(default_factory=list)
    sum_ms: float = 0.0
    count: int = 0

    def __post_init__(self) -> None:
        self.counts = [0] * (len(self.buckets_ms) + 1)

    def observe(self, v: float) -> None:
        self.sum_ms += v
        self.count += 1
        for i, b in enumerate(self.buckets_ms):
            if v <= b:
                self.counts[i] += 1
                return
        self.counts[-1] += 1


@dataclass
class Metrics:
    _lock: threading.Lock = field(default_factory=threading.Lock)
    requests_total: int = 0
    errors_total: int = 0
    deadline_hits_total: int = 0
    florence_calls_total: int = 0
    grounding_dino_calls_total: int = 0
    segmenter_calls_total: int = 0
    mean_iou_sum: float = 0.0
    iou_obs: int = 0
    latency_ms: Histogram = field(default_factory=Histogram)
    gauges: dict[str, float] = field(default_factory=lambda: defaultdict(float))

    def record_request(self, *, latency_ms: float, mean_iou: float, deadline_hit: bool) -> None:
        with self._lock:
            self.requests_total += 1
            self.latency_ms.observe(latency_ms)
            self.mean_iou_sum += mean_iou
            self.iou_obs += 1
            if deadline_hit:
                self.deadline_hits_total += 1

    def record_error(self) -> None:
        with self._lock:
            self.errors_total += 1

    def set_gauge(self, name: str, value: float) -> None:
        with self._lock:
            self.gauges[name] = value

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "requests_total": self.requests_total,
                "errors_total": self.errors_total,
                "deadline_hits_total": self.deadline_hits_total,
                "mean_iou": self.mean_iou_sum / self.iou_obs if self.iou_obs else 0.0,
                "latency_ms_count": self.latency_ms.count,
                "gauges": dict(self.gauges),
            }

    def render_prometheus(self) -> str:
        with self._lock:
            lines = [
                "# TYPE model_vision_requests_total counter",
                f"model_vision_requests_total {self.requests_total}",
                "# TYPE model_vision_errors_total counter",
                f"model_vision_errors_total {self.errors_total}",
                "# TYPE model_vision_deadline_hits_total counter",
                f"model_vision_deadline_hits_total {self.deadline_hits_total}",
                "# TYPE model_vision_florence_calls_total counter",
                f"model_vision_florence_calls_total {self.florence_calls_total}",
                "# TYPE model_vision_grounding_dino_calls_total counter",
                f"model_vision_grounding_dino_calls_total {self.grounding_dino_calls_total}",
                "# TYPE model_vision_segmenter_calls_total counter",
                f"model_vision_segmenter_calls_total {self.segmenter_calls_total}",
                "# TYPE model_vision_latency_ms histogram",
            ]
            cumul = 0
            for b, cnt in zip(self.latency_ms.buckets_ms, self.latency_ms.counts, strict=False):
                cumul += cnt
                lines.append(f'model_vision_latency_ms_bucket{{le="{b}"}} {cumul}')
            cumul += self.latency_ms.counts[-1]
            lines.append(f'model_vision_latency_ms_bucket{{le="+Inf"}} {cumul}')
            lines.append(f"model_vision_latency_ms_sum {self.latency_ms.sum_ms}")
            lines.append(f"model_vision_latency_ms_count {self.latency_ms.count}")
            for name, val in self.gauges.items():
                lines.append(f"# TYPE model_vision_{name} gauge")
                lines.append(f"model_vision_{name} {val}")
            return "\n".join(lines) + "\n"


_GLOBAL = Metrics()


def metrics() -> Metrics:
    return _GLOBAL
