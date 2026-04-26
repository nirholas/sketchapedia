"""Grounding DINO adapter — escalation path for Florence-2 misses."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from PIL.Image import Image

from .config import Settings
from .geometry import XYXY
from .matching import Detection
from .telemetry import get_logger, metrics

log = get_logger(__name__)


@dataclass
class _Handles:
    torch: Any
    Proc: Any
    Model: Any


def _load_handles() -> _Handles:
    import torch
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
    return _Handles(torch=torch, Proc=AutoProcessor, Model=AutoModelForZeroShotObjectDetection)


class GroundingDINO:
    name: str = "grounding-dino"

    def __init__(self, s: Settings) -> None:
        h = _load_handles()
        self._torch = h.torch
        device = "cuda" if (s.device in ("cuda", "auto") and h.torch.cuda.is_available()) else "cpu"
        dtype = h.torch.float16 if device == "cuda" else h.torch.float32
        self._device, self._dtype = device, dtype
        log.info("grounding_dino.load.start", model=s.grounding_dino_model, device=device)
        self._proc = h.Proc.from_pretrained(s.grounding_dino_model)
        self._model = h.Model.from_pretrained(s.grounding_dino_model, torch_dtype=dtype).to(device)
        self._model.eval()
        log.info("grounding_dino.load.done", model=s.grounding_dino_model)

    def detect(self, image: Image, label: str) -> list[Detection]:
        label = (label or "").strip()
        if not label:
            return []
        text = label if label.endswith(".") else f"{label}."
        inputs = {k: v.to(self._device) for k, v in
                  self._proc(images=image, text=text, return_tensors="pt").items()}
        with self._torch.inference_mode():
            outputs = self._model(**inputs)
        target_sizes = self._torch.tensor([[image.height, image.width]], device=self._device)
        results = self._proc.post_process_grounded_object_detection(
            outputs, inputs["input_ids"], box_threshold=0.25, text_threshold=0.25,
            target_sizes=target_sizes,
        )
        if not results:
            return []
        res = results[0]
        boxes = res["boxes"].detach().cpu().tolist()
        scores = res["scores"].detach().cpu().tolist()
        labels_out = res.get("labels") or res.get("text_labels") or [label] * len(boxes)
        out = [
            Detection(phrase=str(lbl), bbox=XYXY(float(b[0]), float(b[1]), float(b[2]), float(b[3])),
                      score=float(sc))
            for b, sc, lbl in zip(boxes, scores, labels_out, strict=False) if len(b) == 4
        ]
        out.sort(key=lambda d: d.score, reverse=True)
        metrics().grounding_dino_calls_total += 1
        return out
