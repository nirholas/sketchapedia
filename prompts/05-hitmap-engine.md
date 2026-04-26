# 05 — Hitmap Engine

## Project context

In Sketchapedia, the canvas displays generated imagery; an invisible DOM overlay + a geometric hitmap encode the logical meaning of the pixels. The hitmap engine turns pointer / keyboard / focus events into typed intents against named regions, cooperating tightly with the DOM overlay (prompt 06) and the scene graph router (prompt 07). See `prompts/00-vision.md`.

## Your task

Implement hit-testing, event normalization, and intent dispatch inside `packages/client-core/src/hitmap/`. The engine never mutates the DOM directly — it publishes events that the overlay and router subscribe to. It owns geometric correctness and input ergonomics (drag, long-press, double-click, hover hysteresis, pointer capture).

## Technical requirements

- Input: the `Hitmap` type from `@sketchapedia/protocol`.
- Geometry:
  - BBox hit-test: O(1) inclusive interval check.
  - Polygon hit-test: winding-number (handles concave correctly; crossing-number has edge issues).
  - **Spatial index**: build a uniform grid (cell ≈ `max(1, sqrt(viewport_area / item_count))`) for sub-linear query. Rebuild on hitmap swap; incremental updates out of scope.
- Coordinate space: accept viewport CSS pixels from the DOM, convert to keyframe space via the `CoordinateMapper` from prompt 04. Hitmap items are authored in whichever space the `Hitmap.coordinateSpace` says.
- Pointer events only (no `mousedown`/`touchstart` dualism). Normalize primary/secondary button, pen pressure, multi-touch limited to first touch in v1.
- Keyboard: **Tab order** derived from `tabIndex` with ascending sort stability; `Enter`/`Space` activates, matching ARIA conventions; arrow-key navigation across items with matching `role` (tablist, radiogroup, slider).
- Hover: debounced entry (50ms) to avoid flicker during transitions. Pointer capture on press to prevent lost-button-up bugs.
- Drag: `onDragStart` fires after 4px movement threshold; emits `DragUpdate` with delta in both coordinate spaces.

## Public API

```ts
interface HitmapEngine {
  setHitmap(hitmap: Hitmap, mapper: CoordinateMapper): void;
  clear(): void;

  // Event sources — subscribable
  readonly pointer: EventSource<PointerIntentEvent>;
  readonly keyboard: EventSource<KeyboardIntentEvent>;
  readonly focus: EventSource<FocusEvent>;
  readonly hover: EventSource<HoverEvent>;

  // Programmatic queries
  hitAt(viewportPoint: Point): HitmapItem | null;
  itemsByRole(role: AriaRole): readonly HitmapItem[];
  itemById(id: string): HitmapItem | null;

  // Focus management
  focus(id: string, opts?: { scroll?: boolean; silent?: boolean }): void;
  focusNext(direction: "forward" | "backward" | "up" | "down" | "left" | "right"): void;

  attach(host: HTMLElement): Disposable;
}
```

`PointerIntentEvent` carries `{ item, phase: "down" | "up" | "tap" | "long-press" | "double-tap", viewportPoint, keyframePoint, modifiers, rawEvent }`.

## Implementation mandates

- Pure TS. Zero dependencies beyond protocol package.
- Every event has a **`preventDefault`** hook so the DOM overlay (prompt 06) can take over for real `<input>` regions.
- Long-press threshold default 500ms; configurable.
- Double-tap window default 300ms; configurable.
- Rejects malformed hitmaps at `setHitmap` with typed errors (self-intersecting polygons, BBox with zero area, duplicate IDs).
- Focus ring rendering is **not** this module's job (see prompt 06 for the overlay and prompt 13 for a11y).
- Telemetry: emit `hitmap.hit.count`, `hitmap.miss.count`, `hitmap.latency_ms` to the observability bus.

## Test plan

- Property tests (fast-check) on polygon hit-test: point strictly inside convex poly → true; strictly outside → false; on edge → implementation-defined but stable.
- 10 000-item hitmap: `hitAt` p99 < 0.5ms on a mid-range laptop.
- Synthetic pointer event replay: a sequence of `down`, `move` (3 px), `up` produces a `tap`; `down`, `move` (10 px), `up` produces a `drag` + `up` with no `tap`.
- Long-press: `down`, wait 600ms, `up` → `long-press`, no `tap`.
- Keyboard tab cycles through all items with non-negative `tabIndex` in order.
- Arrow-key navigation within a `role: "tablist"` moves focus among siblings only.
- Hover hysteresis: pointer moves rapidly across boundary 10 times in 30ms → at most 1 `hover` event fires.

## Deliverables

- `packages/client-core/src/hitmap/engine.ts`, `geometry.ts`, `spatial-index.ts`, `pointer.ts`, `keyboard.ts`, `focus.ts`, `types.ts`.
- Test files covering each.
- `packages/client-core/README-hitmap.md`.

## Acceptance criteria

- All tests green across Chromium, Firefox, WebKit.
- Zero DOM mutations performed by this package (verified by a test that installs a MutationObserver and asserts no records).
- p99 `hitAt` < 0.5ms under 10 000-item load.
- Keyboard navigation fully functional with no pointer events.

## Non-goals

- No DOM element creation (that's prompt 06).
- No scene routing decisions (prompt 07).
- No accessibility tree construction (prompt 13).
- No IME handling — that lives with the text `<input>` in prompt 06.
