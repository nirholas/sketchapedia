# 11 — Effects & Shaders Layer

## Project context

Sketchapedia's generated imagery is static between keyframes, but UX demands feel-alive feedback: hover highlights, cursor-reactive shaders, focus rings that trace arbitrary polygon shapes, particle/glow feedback on click, subtle parallax on scroll. These run locally on the GPU without hitting the model, so every micro-interaction feels immediate. See `prompts/00-vision.md`.

## Your task

Implement `packages/client-core/src/effects/` — a WebGL2 (with opt-in WebGPU) overlay that composites on top of the canvas renderer's output (prompt 04). Reads hitmap geometry from prompt 05; subscribes to hover/focus events from prompts 05/06. Exposes a small, declarative shader API; ships a library of default effects.

## Technical requirements

- **WebGL2** primary path. **WebGPU** opt-in behind `navigator.gpu` feature detection.
- Effect layer shares the same `<canvas>` as the renderer via `context attributes` compositing, or uses a stacked transparent canvas with `pointer-events: none`. Choose stacked for simpler Z-ordering; justify in README.
- Shaders written in GLSL ES 3.00 (WebGL2) with a WGSL mirror for WebGPU; a shared preprocessor extracts common uniforms to avoid duplication.
- Effects declare their inputs (hitmap region, hover state, time, pointer position in keyframe space) and outputs (blend mode, region mask).
- Frame rate capped at display refresh (`requestAnimationFrame`) and paused when the tab is hidden (`Page Visibility API`) or when `reduceMotion` is active.

## Default effect library

- `focusRing` — animated stroke along a polygon, 2px, WCAG-contrast-aware color, dashed pulse at 60 BPM. Respects `prefers-reduced-motion`.
- `hoverGlow` — radial gradient bloom clipped to the hovered item's region; intensity keyed to pointer proximity.
- `cursorTrail` — ribbon of soft dots following pointer; fades out 300ms after idle.
- `clickBurst` — particle emission from click point; 200ms duration; deterministic seed for tests.
- `parallaxLayer` — subtle 4px translation of a scene element based on scroll position (for scenes that opt into the `parallax` capability in their stateSchema).
- `typingIndicator` — pulsing caret glow over an active text input (for the DOM overlay's invisible input fields).

## Public API

```ts
interface EffectsLayer {
  mount(host: HTMLElement, mapper: CoordinateMapper): Disposable;
  setHitmap(hitmap: Hitmap): void;
  enable(name: EffectName, opts?: EffectOptions): void;
  disable(name: EffectName): void;
  fire(name: EffectName, event: { at: Point; itemId?: string }): void;

  register(name: string, effect: EffectDefinition): void; // custom shaders

  readonly metrics: EffectsMetrics; // fps, drawCalls, gpuTimeMs (WebGPU only)
}
```

## Implementation mandates

- Zero allocations inside the hot render loop (reuse float32 buffers, avoid `Array.from` on uniforms).
- Texture atlas for icons and sprite-based effects; generated at mount.
- Respects `prefers-reduced-motion`: reduces amplitude by 70%, disables particle effects, shortens durations.
- `disable` cancels in-flight animations cleanly.
- Debug HUD toggle (`effects.setDebug(true)`) overlays region outlines and draws a frame-time graph — used by prompt 23 devtools.
- Color values pulled from CSS custom properties where provided by the host (`--sk-focus-ring-color`, etc.) with sensible defaults.
- No `eval`, no runtime shader composition from user strings — all shaders are compiled at build time; custom registrations accept pre-compiled shader modules.

## Test plan

- Browser tests (Playwright + vitest-browser):
  - Draw each default effect against a known hitmap; capture `canvas.toDataURL()`; diff vs. golden images with a small perceptual tolerance.
  - `prefers-reduced-motion` on: assert cursor trail and click burst do not emit; focus ring renders static.
  - Tab hidden: FPS drops to 0; resume on `visibilitychange`.
  - Memory: 1000 click bursts then GC; no texture leak.
  - WebGL context loss: simulate `WEBGL_lose_context`, verify effects layer gracefully pauses and resumes on restore.

## Deliverables

- `packages/client-core/src/effects/{layer.ts, scheduler.ts, shaders/*.glsl, shaders/*.wgsl, effects/{focus-ring,hover-glow,cursor-trail,click-burst,parallax,typing-indicator}.ts, types.ts}`.
- Golden image fixtures.
- `packages/client-core/README-effects.md` with a gallery.

## Acceptance criteria

- All default effects render within 2ms per frame on a mid-range integrated GPU.
- Golden image diffs pass on Chromium, Firefox, WebKit.
- Zero WebGL errors in console during any scene sequence in the reference apps (prompts 29–32).

## Non-goals

- No shader authoring tooling for consumers (future).
- No physics simulation.
- No full WebGPU rewrite — WebGPU is an opt-in acceleration path for the same effects.
