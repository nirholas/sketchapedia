# 12 — Scrubbable Media Primitive

## Project context

Reference video #4 — the Evolution of Times Square — shows a user dragging a scrubber and seeing the cityscape morph through decades in real time. Regenerating per-frame is infeasible. The practical pattern: pre-generate a bounded frame sequence keyed to a scalar state variable; the client interpolates on scrub. This repo's `flipbook.js-gh-pages/` unzip already demonstrates the image-sequence playback pattern. Sketchapedia turns this into a first-class scene primitive. See `prompts/00-vision.md`.

## Your task

Implement `packages/client-core/src/scrubbable/` — a primitive that binds a scalar (or vector) state variable to a pre-generated frame sequence, displaying the frame matching the current state value with configurable interpolation. Integrates with the renderer (prompt 04) and scene state.

## Technical requirements

- Frame sources supported:
  - Discrete image sequence (ordered `ImageBitmap[]` or URLs).
  - Encoded video (AV1 / H264) with a frame index — seekable via WebCodecs.
  - Morph pairs: two keyframes + a lightweight client-side interpolation (opacity crossfade or a precomputed FLOW field).
- Driven by scene state: a scene declares a `scrubbable` block per region: `{ stateField: string, frameSource: FrameSource, interpolation: "nearest" | "linear" | "flow" }`.
- Scrubber interactions originate from the DOM overlay (e.g. `<input type="range">`) or from a custom region declared in the hitmap; both paths produce state updates.
- **Preloading**: progressive — loads every Nth frame first for coarse scrub, fills in between frames as bandwidth permits.
- **Flow interpolation**: precomputed optical flow stored as a separate artifact (emitted optionally by the image model in prompt 17). Client uses a tiny WebGL2 shader to warp frames by flow vectors, producing smooth motion with only 2 keyframes.
- **Region-scoped**: a scene may contain multiple scrubbable regions (e.g. separate scrubbers for year and time-of-day). Each draws to its own sub-rectangle within the keyframe; the composite target is the main canvas.

## Public API

```ts
interface ScrubbableController {
  mount(renderer: SceneRenderer, mapper: CoordinateMapper): Disposable;
  setRegions(regions: ScrubbableRegion[]): void;
  setValue(regionId: string, value: number | number[]): void;
  preload(regionId: string, strategy: "coarse" | "full"): Promise<void>;
  dispose(): void;

  readonly metrics: ScrubbableMetrics; // framesLoaded, cacheBytes, fps
}

type ScrubbableRegion = {
  id: string;
  bbox: BBox;                             // in keyframe space
  stateField: string;                     // JSON path in scene state
  frameSource: FrameSource;
  interpolation: "nearest" | "linear" | "flow";
};

type FrameSource =
  | { kind: "sequence"; urls: string[]; keyedBy: "index" | "label"; labels?: string[] }
  | { kind: "video"; url: string; codec: Codec; frameCount: number; fps: number }
  | { kind: "morph"; pairs: Array<{ fromUrl: string; toUrl: string; flowUrl?: string; at: number }> };
```

## Interpolation modes

- **nearest** — snap to closest frame index.
- **linear** — blend two adjacent frames with opacity; simple cross-fade.
- **flow** — warp using a 2-channel flow texture + linear residual; shader-based, ~0.5ms per frame.

## Implementation mandates

- Zero blocking on the main thread. Decoders run in Web Workers where supported; pass `ImageBitmap` via `postMessage(…, [transfer])`.
- Continuous scrub on a range input produces 60fps updates. Debounce not required — the pipeline must keep up via frame drop + priority load.
- Integrates with cache (prompt 08): scrubbable artifacts stored once, indexed by their own content-addressed keys.
- Accessibility: the underlying DOM slider (prompt 06) remains authoritative for keyboard arrow-key steps. The scrubbable primitive reacts to state changes only — it does not itself capture input events.

## Test plan

- Playwright + vitest-browser:
  - 42-frame sequence: assert correct frame renders at values 0, 0.5, 1.
  - Linear interpolation at value 0.25 renders a blend of frames 10 and 11 matching a golden image within perceptual tolerance.
  - Rapid scrub (slider dragged across full range in 100ms): no frame drops beyond 10%; final state is correct.
  - Video source: seek to frame 20 completes within 40ms (WebCodecs `decode`).
  - Memory: mount/unmount 50 times with a 200-frame sequence; heap returns to baseline.

## Deliverables

- `packages/client-core/src/scrubbable/{controller.ts, decoders/{sequence,video,morph}.ts, worker.ts, flow-shader.ts, types.ts}`.
- Golden fixtures + tests.
- `packages/client-core/README-scrubbable.md`.

## Acceptance criteria

- Reference app "Times Square" (prompt 31) uses this primitive for the era scrubber.
- Sustained 60fps during scrub on a 200-frame sequence.
- `flow` interpolation with 2 keyframes visibly smoother than `linear` on a standard motion test fixture.

## Non-goals

- No server-side generation of optical flow (prompt 17 optionally emits it; this prompt only consumes).
- No per-frame LLM-driven regeneration — that's the failure mode the whole project avoids.
