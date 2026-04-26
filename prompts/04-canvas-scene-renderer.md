# 04 — Canvas Scene Renderer

## Project context

Sketchapedia renders UI as generated imagery on a `<canvas>`. Between keyframes, short transition videos morph one scene into the next. The renderer is the lowest layer of the client stack: everything else (hitmap overlay, effects, scene graph) composes onto it. See `prompts/00-vision.md`.

## Your task

Implement the canvas compositor and media pipeline inside `packages/client-core/src/render/`. It must display static keyframes, play transition clips, support crossfades as a fallback when a transition isn't available, expose an efficient coordinate-mapping API (viewport ↔ keyframe space), and cooperate with the hitmap engine (prompt 05) and effects layer (prompt 11) via well-defined composite hooks.

## Technical requirements

- Use **OffscreenCanvas** when supported; fall back to main-thread `HTMLCanvasElement`.
- 2D context for keyframes, composited with a parallel **WebGL2** context (created via `<canvas>` or a shared OffscreenCanvas) for effects overlays.
- **WebCodecs** `VideoDecoder` for transition playback. Do not use `<video>` elements — you cannot composite their frames pixel-accurately with canvas output on all browsers. Fall back to `<video>` drawn via `drawImage` only on Safari < 17.4, and log the fallback.
- **DevicePixelRatio awareness**: internal buffer at `dpr × cssSize`; public coordinate API always in CSS pixels.
- **Keyframe coordinate space**: every `Scene` declares a logical keyframe size (e.g. 1920×1080). The renderer fits/fills into the viewport with configurable `fit: "contain" | "cover" | "stretch"` and exposes `keyframeToViewport(p)` and `viewportToKeyframe(p)` matrices.
- Decode pipeline streams frames; backpressure into the transport layer via an `onFrameNeeded(deadlineMs)` callback.
- Smooth-scaling via `imageSmoothingQuality: "high"` and optional mipmap generation on WebGL path.
- **Resize observer** on the host element; re-projects without re-decoding.
- **ColorSpace**: use `display-p3` where supported; graceful degrade to sRGB.

## Public API

```ts
class SceneRenderer {
  constructor(host: HTMLElement, opts?: SceneRendererOptions);

  mount(): void;
  unmount(): void;

  async commitScene(scene: Scene, source: KeyframeSource): Promise<void>;
  async playTransition(transition: TransitionSource, opts?: { onFrame?: (t: number) => void }): Promise<void>;

  readonly coordinate: CoordinateMapper; // keyframeToViewport / viewportToKeyframe
  readonly metrics: RendererMetrics;      // fps, lastFrameMs, droppedFrames, decoderQueue

  setFitMode(mode: "contain" | "cover" | "stretch"): void;

  // Composite hooks consumed by effects (prompt 11) and DOM overlay (prompt 06).
  onBeforeComposite(cb: (ctx: CompositeCtx) => void): Disposable;
  onAfterComposite(cb: (ctx: CompositeCtx) => void): Disposable;
}

type KeyframeSource =
  | { kind: "url"; url: string; format: "image/webp" | "image/avif" | "image/png" }
  | { kind: "blob"; blob: Blob }
  | { kind: "bitmap"; bitmap: ImageBitmap };

type TransitionSource =
  | { kind: "url"; url: string; codec: "av1" | "h264" | "vp9"; durationMs: number }
  | { kind: "stream"; stream: ReadableStream<EncodedVideoChunk>; config: VideoDecoderConfig; durationMs: number };
```

## Implementation mandates

- Zero runtime dependencies beyond `eventemitter3` (or hand-rolled typed emitter) and the `@sketchapedia/protocol` package.
- Frame pacing uses `requestVideoFrameCallback` when available; `requestAnimationFrame` otherwise. Never `setTimeout`.
- Each `commitScene` atomically swaps the active keyframe; in-flight transitions are cancelled cleanly (decoder `close()`, buffers released, `AbortSignal` honored).
- Graceful format fallback: probe `VideoDecoder.isConfigSupported` ahead of play; crossfade fallback must match duration exactly.
- Memory: release `ImageBitmap` objects on scene replacement; enforce a bounded decoder queue (default 6 frames).
- Telemetry: expose `metrics` via `PerformanceObserver` entries under the `sketchapedia:render` namespace.
- All errors are typed (`RendererError` discriminated union) and surfaced via both promise rejection and an `error` event.

## Test plan

- Unit tests with **vitest-browser** running against Playwright-controlled Chromium, Firefox, WebKit.
- Render a synthetic solid-color `ImageBitmap`, assert pixel readback at known coordinates.
- Play a deterministic 24-frame transition clip (AV1, checked into test fixtures), verify `onFrame` fires exactly 24 times and final pixel matches the last keyframe.
- Coordinate-mapping round-trip: `keyframeToViewport(viewportToKeyframe(p)) ≈ p` within 0.5 CSS px for random viewport shapes.
- DPR change (1 → 2) mid-play does not reset decoder; content redraws at higher resolution.
- Decoder error during play produces `RendererError` with `cause` set; subsequent `commitScene` recovers.

## Deliverables

- `packages/client-core/src/render/*.ts` (`SceneRenderer`, `CoordinateMapper`, `WebCodecsPlayer`, `CrossfadePlayer`, `RendererError`, `types.ts`).
- `packages/client-core/src/render/*.test.ts`.
- `packages/client-core/test-fixtures/` with real AV1 and WebP assets (generated via `ffmpeg` in a setup script, committed).
- `packages/client-core/README-render.md` describing the compositor architecture and lifecycle.

## Acceptance criteria

- Browser tests green in Chromium, Firefox, WebKit.
- 60fps playback sustained on a mid-range laptop for a 1920×1080 AV1 clip.
- Rapid `commitScene` calls (10/sec) never leak `ImageBitmap` — `performance.memory.usedJSHeapSize` returns to baseline after 1 second idle.
- No `any` in the public API surface.
- Public API typed so that a `HTMLElement` host is required at construction.

## Non-goals

- No hit-testing or interaction (prompt 05).
- No DOM overlay management (prompt 06).
- No transport/networking (prompt 09).
- No React wrappers (prompt 10).
- No WebGPU pipeline (future; WebGL2 is sufficient for v1).
