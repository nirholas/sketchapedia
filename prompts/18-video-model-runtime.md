# 18 — Video Model Runtime (Transition Clips)

## Project context

Each scene change plays a short transition clip (0.5–1.5s) that morphs the previous keyframe into the next. This is the aesthetic crown jewel — smooth generative transitions are what differentiates Sketchapedia from a slideshow. The video model is **LTX-Video** (mentioned in the user's vision), chosen for its real-time-ish inference speed and keyframe-conditioned generation. See `prompts/00-vision.md`.

## Your task

Implement `packages/model-video/` — a Python inference server wrapping **LTX-Video** (Lightricks) conditioned on the prior keyframe + next keyframe + optional semantic prompt. Emits a high-efficiency AV1 clip. TypeScript client for the orchestrator.

## Technical requirements

- Runtime: **Python 3.11**, **PyTorch 2.4+**, LTX-Video official inference code (MIT-licensed; pinned commit).
- Inference server: **FastAPI** with async SSE progress.
- Input: two keyframes (PNG/WebP) + optional semantic transition prompt (`"zoom into the Eiffel Tower cross-section"`) + duration (default 1.0s, range 0.4–2.0s) + fps (default 24).
- Output: AV1 clip (primary) via `ffmpeg-python` with `libsvtav1` encoder; H.264 fallback for clients that don't support AV1.
- **Temporal conditioning**: LTX-Video's image-to-video mode initialized with both start and end frames; diffusion sampling produces intermediate frames.
- **Semantic conditioning**: text prompt enhances the model's understanding of the transition (zoom vs. crossfade vs. morph vs. redraw).
- **Style guidance**: lightweight color-palette preservation via conditioning the first frame exactly.
- **Caching**: LRU of compiled UNet graphs with various shape combinations.

## HTTP API

```
POST /transition
{
  "from_keyframe_url": "...",
  "to_keyframe_url": "...",
  "semantic_hint": "zoom-in" | "crossfade" | "morph" | "redraw" | null,
  "prompt": "optional text",
  "duration_ms": 1000,
  "fps": 24,
  "size": { "width": 1280, "height": 720 },  // transitions rendered at 720p; upsampled client-side if needed
  "seed": 42
}
→ 200 { "clip_url": "s3://...", "hash": "...", "codec": "av1", "duration_ms": 1000, "frames": 24 }
```

Progress SSE: `{ "progress": 0.4, "stage": "sampling" }`.

## Implementation mandates

- Async request queue with bounded GPU concurrency (1 request per GPU for v1; LTX-Video is memory-heavy on long clips).
- Graceful shedding: when queue length > threshold, refuse new with 429; orchestrator falls back to client-side crossfade (see prompt 04).
- Deadline: hard 3-second cap per clip; partial results dropped.
- Encoder tuning: SVT-AV1 with `--preset 6 --crf 32 --pix_fmt yuv420p10le` balancing quality / size for 24 frames. Two-pass not used (single-pass fast encode).
- Clip size budget: target ≤ 300 KiB for 1.0s@720p; fail loudly if exceeds.
- The orchestrator always proceeds with the keyframe before the clip is ready; video is optional, never blocking.
- Safety: same content-policy check as the image model.

## Optical flow output (optional)

- When `return_flow: true` is set, compute and store optical flow between from/to (using RAFT or Liteflownet) alongside the clip. Artifact consumed by the scrubbable primitive (prompt 12) for cheap interpolation of future scenes.
- Output: two-channel PNG-16 or EXR, content-addressed.

## Test plan

- Real GPU in CI. Golden fixtures: 10 from/to keyframe pairs with human-reviewed quality scores.
- Perceptual continuity: SSIM between first clip frame and `from_keyframe` ≥ 0.95; last frame and `to_keyframe` ≥ 0.95.
- Codec correctness: AV1 clip decodes in `ffmpeg` without errors; frame count matches requested fps × duration within ±1 frame.
- Seed reproducibility: same input + seed → byte-identical clip (within encoder nondeterminism allowances — assert on raw tensor output before encode).
- Deadline: 3-second cap honored; if exceeded, partial output dropped and error returned.
- Memory / queue: 20 parallel requests behind concurrency=1; all complete without OOM.

## Deliverables

- `packages/model-video/server/` (Python) — FastAPI server, LTX-Video integration, flow computation, AV1 encode, Dockerfile.
- `packages/model-video/client/` (TypeScript) — SSE client.
- `packages/model-video/MODEL_CARD.md`.
- `packages/model-video/README.md`.

## Acceptance criteria

- p95 generation latency ≤ 3s on an L40S for 1.0s@720p@24fps clip.
- All 10 golden fixtures achieve SSIM ≥ 0.95 on start/end match.
- AV1 output plays in Chromium, Firefox, WebKit without manual codec flags.
- Orchestrator fallback verified: video timeout does not block scene commit.

## Non-goals

- No longer clips than 2s (not the use case).
- No audio (prompt 17 handles generative audio hooks optionally; true TTS/music is future work).
- No frame-by-frame edits.
