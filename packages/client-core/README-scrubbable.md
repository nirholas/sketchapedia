# @sketchapedia/client-core — Scrubbable Media Primitive

A scene primitive that binds a **scalar (or vector) state variable** to a
pre-generated **frame sequence** and renders the matching frame with
configurable interpolation. It's the building block behind experiences like
the *Times Square era scrubber* — drag, see the cityscape morph.

Regenerating per-frame with an image model on every tick is infeasible.
Instead we pre-generate a bounded set of keyframes keyed by the state
variable, and the client interpolates between them on scrub. This module
implements the client half of that contract.

```
  <input type="range">   ──►   scene.state.era = t
  (DOM overlay, prompt 6)              │
                                       ▼
                  ScrubbableController.setValue('era', t)
                                       │
                                       ▼
              planDraw(value → frame index + mix)
                nearest | linear | flow
                                       │
                                       ▼
          ┌─────────────┬─────────────┬─────────────┐
          │ Sequence    │ Video       │ Morph       │
          │ decoder     │ decoder     │ decoder     │
          │             │ (WebCodecs) │ (+optical   │
          │             │             │  flow)      │
          └─────────────┴─────────────┴─────────────┘
                                       │
                                       ▼
                  SceneRenderer.onAfterComposite
                  → ctx.drawImage into region bbox
```

## Quickstart

```ts
import {
  createScrubbableController,
  type ScrubbableRegion,
} from '@sketchapedia/client-core/scrubbable';

const controller = createScrubbableController();

controller.mount(sceneRenderer, sceneRenderer.coordinate);

const eraRegion: ScrubbableRegion = {
  id: 'era',
  bbox: { x: 0, y: 0, w: 1920, h: 1080 },
  stateField: 'era.year',
  frameSource: {
    kind: 'sequence',
    urls: [...yearFrameUrls], // 42 frames: 1900, 1905, ..., 2025
    keyedBy: 'index',
  },
  interpolation: 'linear',
};

controller.setRegions([eraRegion]);
await controller.preload('era', 'coarse');

slider.addEventListener('input', () => {
  controller.setValue('era', slider.valueAsNumber); // value in [0, 1]
});
```

## Concepts

### Regions

A scene may declare **multiple scrubbable regions** — e.g. year scrubber on
top, time-of-day scrubber below. Each draws into its own bbox within the
keyframe coordinate space declared by the renderer (prompt 04); the renderer
maps keyframe coords to viewport CSS pixels.

Regions are identified by stable `id`. `setRegions` replaces the declaration
set atomically: removed regions have their decoders disposed, unchanged
regions re-use their decoders, changed regions get fresh ones.

### Frame sources

```ts
type FrameSource =
  | { kind: 'sequence'; urls; keyedBy: 'index' | 'label'; labels? }
  | { kind: 'video'; url; codec; frameCount; fps }
  | { kind: 'morph'; pairs: [{ fromUrl, toUrl, flowUrl?, at }] };
```

- **sequence** — ordered image URLs, one per frame. Simplest; works everywhere.
- **video** — encoded clip (AV1 / H264 / VP9) seekable by frame index via
  WebCodecs. See *WebCodecs* below.
- **morph** — sparse keyframes with optional pre-computed **optical flow**
  artifacts between adjacent pairs (prompt 17 optionally emits these). The
  client warps between two frames using a tiny WebGL2 shader, producing
  smooth motion with only 2 keyframes.

### Interpolation modes

| Mode      | What it does                                              | Cost            |
| --------- | --------------------------------------------------------- | --------------- |
| `nearest` | Snap to the closest frame index. Crisp, may judder.       | Free.           |
| `linear`  | Cross-fade two adjacent frames by opacity.                | ~1 extra blit.  |
| `flow`    | Warp frames by a pre-computed flow field + residual blend.| ~0.5ms GPU.     |

`flow` degrades gracefully to `linear` when (a) no flow artifact is declared,
(b) no `FlowWarper` is wired in, or (c) the flow artifact is still fetching.

### Value → frame index

The controller maps a raw state value to a **fractional frame index**:

- Scalars in `[0, 1]` are interpreted as a unit scrubber position and scaled
  to `[0, frameCount - 1]`.
- Scalars outside `[0, 1]` are treated as direct frame indices (clamped).
- Vector values use the first component.
- Labeled sequences (`keyedBy: 'label'`) also accept label strings for
  scrubbers with discrete, named positions.

All mapping logic lives in
[`frame-selection.ts`](./src/scrubbable/frame-selection.ts) as pure functions
— easy to unit-test without touching the DOM.

## Progressive preloading

The decoder supports two strategies:

- **`coarse`** — every ~20th frame, so even a first-time scrub produces
  visible motion immediately, filling in between as bandwidth permits.
- **`full`** — every frame.

Active-frame fetches use the `active` priority and surface immediately when
resolved. The controller always primes the **currently-targeted frame** and
its immediate neighbors on every `setValue` call, so sustained scrubs get
cache hits after the first round-trip.

## WebCodecs

The video decoder exposes the seam `getFrame(index)` but the demuxer is
deliberately not bundled: real deployments wire an MP4Box or WebM demuxer of
their choice. If you just want sequence-style scrubbing, transcode to an
image sequence and use the `sequence` source. The seam is there so prompt
18's video runtime can plug in without touching the controller or scene
declaration.

## Flow artifact format

`parseFlowArtifact` / `encodeFlowArtifact` handle a tiny binary format:

```
offset  size  field
  0      4    magic "FLOW"
  4      4    width  (u32 LE)
  8      4    height (u32 LE)
 12      4    scale  (f32 LE) — displacement = (byte - 128) * scale
 16    ...    width * height * 2 bytes, row-major, dx then dy
```

## Public API

See [`types.ts`](./src/scrubbable/types.ts). Highlights:

```ts
interface ScrubbableController {
  mount(renderer, mapper): Disposable;
  setRegions(regions: ScrubbableRegion[]): void;
  setValue(regionId: string, value: number | number[]): void;
  preload(regionId: string, strategy: 'coarse' | 'full'): Promise<void>;
  dispose(): void;
  readonly metrics: ScrubbableMetrics;
}
```

## Web Worker decoding

`src/scrubbable/worker.ts` is a bundleable worker entry that accepts a list
of URLs, fetches + `createImageBitmap`s them off the main thread, and
transfers the resulting `ImageBitmap`s back via `postMessage(…, [bitmap])`.
Wire it in by providing a custom `DecoderFactory` that routes fetches
through a `Worker` instance — the main-thread decoder is intentionally the
default so consumers without a bundler step can still use the primitive.

## Non-goals

- No server-side generation of optical flow. Prompt 17 optionally emits it.
- No per-frame LLM-driven regeneration — that's the failure mode the entire
  project avoids.
- No DOM event capture — the primitive only reacts to `setValue`. The
  overlay (prompt 06) remains authoritative for keyboard handling and
  emits the state updates that land here.
