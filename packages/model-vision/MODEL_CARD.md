# Model Card — Sketchapedia model-vision

This card describes the **vision-grounding service** that corrects an LLM-drafted
hitmap against a rendered keyframe so the invisible DOM overlay lands on the
right pixels. See `prompts/19-hitmap-vision-correction.md` for the build spec
and `prompts/00-vision.md` for the system context.

## Purpose

The image model (`@sketchapedia/model-image`, prompt 17) renders a keyframe
that may drift a few pixels from the LLM's declared layout. This service
re-grounds each hitmap item against the rendered pixels and returns a
corrected hitmap. Without this pass, hitmap-to-pixel alignment IoU is
typically 0.4–0.6; with it, ≥ 0.75 is the acceptance bar.

## Models used

### Primary — Florence-2

| Field | Value |
| --- | --- |
| Identifier | `microsoft/Florence-2-base-ft` (default) or `microsoft/Florence-2-large` |
| Tasks | `<CAPTION_TO_PHRASE_GROUNDING>`, `<OPEN_VOCABULARY_DETECTION>`, `<REGION_TO_SEGMENTATION>` |
| Parameters | 230M (base-ft) / 770M (large) |
| License | MIT |
| Source | <https://huggingface.co/microsoft/Florence-2-base-ft> |
| Precision | bfloat16 on Ampere+, float16 on T4, float32 on CPU |

Florence-2 is used in batched mode: a single caption is composed from all
hitmap item labels (semicolon-separated, max 32 per call) and the model emits
phrase→bbox pairs. We then run `<REGION_TO_SEGMENTATION>` on accepted bboxes
that originated from polygon items to recover refined polygons.

### Secondary — Grounding DINO (escalation)

| Field | Value |
| --- | --- |
| Identifier | `IDEA-Research/grounding-dino-tiny` |
| Backbone | Swin-T |
| Parameters | 172M |
| License | Apache-2.0 |
| Source | <https://huggingface.co/IDEA-Research/grounding-dino-tiny> |

Used per-item when Florence-2 fails to ground a draft item (label similarity
< 0.45 or no detection returned). Slower than Florence batched grounding,
hence reserved for the escalation path.

## Inputs

```jsonc
POST /ground
{
  "keyframeUrl": "https://cache.example/abc.webp",  // OR keyframeB64
  "hitmapDraft": { "items": [...], "viewport": { "width": 1920, "height": 1080 } },
  "mode": "auto",          // "auto" | "florence" | "grounding-dino"
  "deadlineMs": 500
}
```

The keyframe must be ≤ 8 MB. URL fetches are restricted to http/https with a
2 s timeout. Image bytes are never logged — only the sha256 digest.

## Outputs

```jsonc
{
  "hitmap":      { "items": [...corrected with confidence + lowConfidence flags] },
  "diagnostics": {
    "meanConfidence": 0.87, "meanIou": 0.81,
    "matchRate": 0.95, "escalationRate": 0.10,
    "deadlineHit": false, "latencyMs": 312.4,
    "corrections": [...], "keyframeHash": "sha256:..."
  }
}
```

A streaming variant `/ground/stream` emits `started`, `loading`, `completed`,
`error` events as Server-Sent Events.

## Correction algorithm

1. Compose a single caption from per-item aria labels.
2. Run Florence-2 `<CAPTION_TO_PHRASE_GROUNDING>` (chunked at 32 items).
3. Match phrases to draft items via Hungarian assignment on a 0.75·label-sim +
   0.25·IoU cost matrix (rapidfuzz token_set_ratio + WRatio max).
4. For each match: if IoU(draft, detection) ≥ 0.50, accept the detection.
   Else retain the draft and flag `lowConfidence`.
5. Polygon items: feed the accepted bbox into `<REGION_TO_SEGMENTATION>` to
   refine into a polygon.
6. Items with no usable Florence match escalate to Grounding DINO with the
   single label.
7. Resolve pairwise overlaps so no two corrected boxes share more than 10% of
   the smaller box's area (preferring higher confidence; falls back to
   original coords if shrinkage would collapse the box).
8. Clip to keyframe bounds; round to integer pixels.

## Acceptance criteria (prompt 19)

| Metric | Target | Verified by |
| --- | --- | --- |
| Mean IoU on 20 fixtures | ≥ 0.75 | `scripts/evaluate.py` |
| p95 latency on A10G | ≤ 500 ms | `scripts/evaluate.py --mode remote` |
| Escalation path reachable | yes | `tests/test_correction.py::test_escalation_activates_on_miss` |
| Overlap ≤ 10% after resolution | yes | `tests/test_correction.py::test_overlap_resolved` |

## Out-of-scope / non-goals

* **No OCR.** Hitmap items reference UI elements by aria label, not text content.
* **No fine-tuning.** Pre-trained Florence-2 + Grounding DINO weights only.
* **No frame-level streaming.** This service is per-keyframe; the orchestrator
  invokes it once per Scene publication.

## Failure modes & mitigations

| Failure | Detection | Mitigation |
| --- | --- | --- |
| Florence emits a wildly wrong box | IoU < 0.50 | Retain draft, `lowConfidence=true` |
| Florence emits no phrases | empty result | Escalate to Grounding DINO per item |
| Both detectors miss | escalation also empty | Keep draft coords, flag low confidence |
| Inference exceeds 500 ms | `Deadline.expired()` | Return best-state hitmap with `deadlineHit: true` |
| Overlap > 10% after correction | `resolve_overlaps` post-pass | Shrink lower-confidence box; fallback to original on collapse |
| OOM / runtime crash | exception | 500 response, `errors_total` counter ticks |

## Safety & privacy

* **Image bytes never logged.** Logs carry only the sha256 digest, item
  counts, and numeric diagnostics (`telemetry.py`).
* **Network egress allowlist.** Keyframe fetches restricted to http/https with
  a hard size cap (8 MB) and a 2 s timeout (`keyframe.py`).
* **No state.** The server is stateless; only model weights are kept warm in
  memory across requests.

## Telemetry

Prometheus-format metrics on `/metrics`:

* `model_vision_requests_total`, `model_vision_errors_total`
* `model_vision_deadline_hits_total`
* `model_vision_florence_calls_total`, `model_vision_grounding_dino_calls_total`,
  `model_vision_segmenter_calls_total`
* `model_vision_latency_ms` (histogram, buckets to 5 s)
* Gauge `model_vision_model_loaded` (0 / 1)

## Operational notes

* Cold start ≈ 60 s for model load; warm requests ≈ 200–400 ms on A10G.
* `MODEL_VISION_ENABLE_TORCH_COMPILE=1` adds ~90 s to cold start, ~15%
  throughput.
* The dispatcher (prompt 22) keeps a warm pool of `model-vision` workers so
  cold starts stay off the request path.
* Health: `/healthz` (always 200), `/readyz` (503 until models load).

## Runtime

* Python 3.11, PyTorch 2.4.1, Transformers 4.46, FastAPI 0.115.
* Dockerfile: `nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04`.
* GPU memory: ~3 GB (Florence-2-base-ft + Grounding-DINO-tiny in bfloat16).
