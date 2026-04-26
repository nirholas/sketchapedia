# 19 — Hitmap Vision Correction

## Project context

Sketchapedia's hitmap-to-pixel alignment is the project's hardest problem. The LLM (prompt 16) emits a hitmap *draft* with semantic intent; the image model (prompt 17) renders with regional conditioning but drifts a few pixels. Before the `Scene` is published to the client, a vision model grounds each hitmap item against the generated image and corrects coordinates. See `prompts/00-vision.md`.

## Your task

Implement `packages/model-vision/` — a grounding service that takes the rendered keyframe + draft hitmap and returns a corrected hitmap with accurate polygons/bboxes. Primary model: **Florence-2** (Microsoft, MIT, fast); secondary: **Grounding DINO** for cases where Florence-2's grounded caption task underperforms.

## Technical requirements

- Runtime: **Python 3.11**, **PyTorch 2.4+**, **transformers ≥ 4.44**, **Florence-2-large** or **Florence-2-base-ft** depending on VRAM.
- Server: **FastAPI**, async SSE progress.
- **Tasks used**:
  - `<OPEN_VOCABULARY_DETECTION>` — given a caption like "the reservation button", returns bboxes.
  - `<REGION_TO_SEGMENTATION>` — given a bbox, returns a polygon mask. For polygon-shaped hitmap items.
  - `<CAPTION_TO_PHRASE_GROUNDING>` — batched: given a full scene caption, returns multiple phrase→bbox pairs in one call.
- Fallback (low confidence): **Grounding DINO** (`IDEA-Research/GroundingDINO`) with Swin-T backbone.
- **Input**: keyframe image + draft hitmap (semantic labels per item). Output: corrected hitmap.
- **Confidence handling**: each corrected item carries a confidence score; low-confidence items retain LLM draft coords (better the LLM's intent than a wrong box).

## HTTP API

```
POST /ground
{
  "keyframe_url": "...",
  "hitmap_draft": { "items": [ ... ] },
  "mode": "grounding-dino" | "florence" | "auto"   // auto runs florence then escalates to GD on low confidence
}
→ 200 {
  "hitmap": { "items": [ ... (corrected) ] },
  "diagnostics": { "meanConfidence": 0.87, "corrections": [ { "id": "...", "iou": 0.72 } ] }
}
```

## Correction algorithm

1. Load keyframe; run `<CAPTION_TO_PHRASE_GROUNDING>` with a single caption assembled by joining per-item labels (`"a blue reserve button; a timeline of availability; a menu image"`).
2. Match detected phrases to draft items by label string similarity (Hungarian assignment on fuzzy match score).
3. For polygon-shaped items, run `<REGION_TO_SEGMENTATION>` on the matched bbox to derive a polygon.
4. Compute IoU against the draft bbox; if > 0.5, accept correction; else retain draft and flag item with low confidence.
5. If any item fails matching entirely, escalate to Grounding DINO with the single item's label.
6. Ensure no two corrected items overlap more than 10% — resolve overlaps by preferring higher-confidence item.
7. Clip all coords to keyframe size; round to integer pixels.
8. Return corrected hitmap + diagnostics.

## Implementation mandates

- Stateless server; warm model load across requests.
- bf16 inference where supported; fp16 on T4.
- Batch-aware: up to 32 items in a single `<CAPTION_TO_PHRASE_GROUNDING>` call.
- Deadline: hard 500ms cap; on timeout, return draft hitmap with `low_confidence=true` for all items.
- Telemetry: per-request mean IoU, match rate, escalation rate to Grounding DINO.
- Safety: the keyframe image is never logged; only hashes and diagnostics.

## Test plan

- Real GPU in CI.
- Fixtures: 20 keyframes from prompt 17 runs, each paired with a hand-labeled ground-truth hitmap.
- Metric: **mean IoU between corrected hitmap and ground truth ≥ 0.75**; without correction (draft from LLM), IoU typically 0.4–0.6 — correction must demonstrably improve on these fixtures.
- Latency: p95 ≤ 500ms per scene with ≤ 20 items on an A10G.
- Escalation: force a miss on a fixture; assert Grounding DINO path activates and improves.
- Overlap resolution: seed two overlapping draft items; assert resolution produces non-overlapping corrected items.

## Deliverables

- `packages/model-vision/server/` — FastAPI server, Florence-2 + Grounding DINO adapters, Dockerfile.
- `packages/model-vision/client/` — TypeScript client for orchestrator.
- `packages/model-vision/MODEL_CARD.md`.
- Labeled fixture set + evaluation script that reports mean IoU.

## Acceptance criteria

- Mean IoU ≥ 0.75 on 20 fixtures.
- p95 latency ≤ 500ms.
- Escalation path exercised and improves outcomes.
- Corrections never introduce overlapping items beyond 10%.

## Non-goals

- No OCR (not required for hitmap).
- No novel detection training; use the pre-trained Florence-2 + Grounding DINO weights.
- No direct integration with the client (orchestrator consumes this service).
