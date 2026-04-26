"""Florence-2 adapter: phrase grounding, open-vocab detection, region segmentation."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from PIL.Image import Image

from .config import Settings
from .detectors import PolygonPrediction
from .geometry import XYXY
from .matching import Detection
from .telemetry import get_logger, metrics

log = get_logger(__name__)
TASK_G = "<CAPTION_TO_PHRASE_GROUNDING>"
TASK_D = "<OPEN_VOCABULARY_DETECTION>"
TASK_S = "<REGION_TO_SEGMENTATION>"


@dataclass
class _Handles:
    torch: Any
    Proc: Any
    Model: Any


def _load_handles() -> _Handles:
    import torch
    from transformers import AutoModelForCausalLM, AutoProcessor
    return _Handles(torch=torch, Proc=AutoProcessor, Model=AutoModelForCausalLM)


class Florence2:
    name: str = "florence-2"

    def __init__(self, s: Settings) -> None:
        self._s = s
        h = _load_handles()
        self._torch = h.torch
        device = "cuda" if (s.device in ("cuda", "auto") and h.torch.cuda.is_available()) else "cpu"
        dtype_map = {"float16": h.torch.float16, "bfloat16": h.torch.bfloat16, "float32": h.torch.float32}
        dtype = dtype_map.get(s.dtype, h.torch.bfloat16)
        if device == "cpu" and dtype is h.torch.bfloat16:
            dtype = h.torch.float32
        self._device, self._dtype = device, dtype
        log.info("florence.load.start", model=s.florence_model, device=device)
        self._proc = h.Proc.from_pretrained(s.florence_model, trust_remote_code=True)
        self._model = h.Model.from_pretrained(s.florence_model, torch_dtype=dtype, trust_remote_code=True).to(device)
        self._model.eval()
        if s.enable_torch_compile and device == "cuda":
            try:
                self._model = h.torch.compile(self._model, mode="reduce-overhead")
            except Exception:  # pragma: no cover
                pass
        log.info("florence.load.done", model=s.florence_model)

    def ground(self, image: Image, caption: str) -> list[Detection]:
        if not caption.strip():
            return []
        chunks = _chunk(caption, self._s.grounding_max_items)
        out: list[Detection] = []
        for chunk in chunks:
            out.extend(self._ground_chunk(image, chunk))
        metrics().florence_calls_total += len(chunks)
        return out

    def _ground_chunk(self, image: Image, caption: str) -> list[Detection]:
        raw = self._infer(image, f"{TASK_G}{caption}", TASK_G)
        return [
            Detection(phrase=str(lbl), bbox=XYXY(float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3])),
                      score=_conf(lbl, caption))
            for bb, lbl in zip(raw.get("bboxes", []) or [], raw.get("labels", []) or [], strict=False)
            if len(bb) == 4
        ]

    def detect(self, image: Image, label: str) -> list[Detection]:
        if not label.strip():
            return []
        raw = self._infer(image, f"{TASK_D}{label}", TASK_D)
        bboxes = raw.get("bboxes", []) or []
        labels = raw.get("bboxes_labels", raw.get("labels", [])) or []
        out = [
            Detection(phrase=str(lbl or label), bbox=XYXY(float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3])),
                      score=_conf(lbl or label, label))
            for bb, lbl in zip(bboxes, labels, strict=False) if len(bb) == 4
        ]
        out.sort(key=lambda d: d.score, reverse=True)
        return out

    def segment(self, image: Image, bbox: tuple[float, float, float, float]) -> PolygonPrediction | None:
        x, y, w, h = bbox
        W, H = image.size
        def loc(v: float, dim: int) -> int:
            return max(0, min(999, round(v / max(1, dim) * 999)))
        toks = f"<loc_{loc(x,W)}><loc_{loc(y,H)}><loc_{loc(x+w,W)}><loc_{loc(y+h,H)}>"
        raw = self._infer(image, f"{TASK_S}{toks}", TASK_S)
        polys = raw.get("polygons", []) or []
        if not polys:
            return None
        flat = polys[0]
        if flat and isinstance(flat[0], list):
            flat = flat[0]
        if len(flat) < 6:
            return None
        pts = [(float(flat[i]), float(flat[i + 1])) for i in range(0, len(flat) - 1, 2)]
        if len(pts) < 3:
            return None
        metrics().segmenter_calls_total += 1
        return PolygonPrediction(points=pts, score=1.0)

    def _infer(self, image: Image, prompt: str, task: str) -> dict[str, Any]:
        inputs = {k: v.to(self._device) for k, v in
                  self._proc(text=prompt, images=image, return_tensors="pt").items()}
        with self._torch.inference_mode():
            gen = self._model.generate(input_ids=inputs["input_ids"],
                                       pixel_values=inputs["pixel_values"].to(self._dtype),
                                       max_new_tokens=1024, num_beams=3, do_sample=False, early_stopping=False)
        text = self._proc.batch_decode(gen, skip_special_tokens=False)[0]
        parsed = self._proc.post_process_generation(text, task=task, image_size=(image.width, image.height))
        return parsed.get(task, {}) if isinstance(parsed, dict) else {}


def _chunk(caption: str, max_items: int) -> list[str]:
    parts = [p.strip() for p in re.split(r"[;\n]", caption) if p.strip()]
    if not parts:
        return []
    if len(parts) <= max_items:
        return ["; ".join(parts)]
    return ["; ".join(parts[i:i + max_items]) for i in range(0, len(parts), max_items)]


def _conf(label: str, caption: str) -> float:
    label, caption = (label or "").strip().lower(), (caption or "").strip().lower()
    if not label:
        return 0.5
    tokens = [t for t in re.split(r"\W+", label) if t]
    if not tokens:
        return 0.5
    return 0.5 + 0.45 * sum(1 for t in tokens if t in caption) / len(tokens)


logging.getLogger("transformers").setLevel(logging.ERROR)
