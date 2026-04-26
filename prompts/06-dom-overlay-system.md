# 06 — Invisible DOM Overlay

## Project context

Sketchapedia's critical insight: instead of simulating text input, focus rings, and screen-reader semantics in pixels, mirror the hitmap into real DOM elements positioned invisibly over the canvas. IME, password managers, browser autofill, translate, find-in-page, copy-paste, keyboard users, and screen readers all *just work* because they are interacting with real inputs and real ARIA-labeled buttons. The overlay reads hitmap + coordinate mapper from prompts 02/04/05 and produces the DOM. See `prompts/00-vision.md`.

## Your task

Implement `packages/client-core/src/overlay/` — the subsystem that materializes a `Hitmap` into a live DOM tree, keeps it positioned and sized correctly as the viewport or scene changes, forwards input values into the scene state store, and coordinates with the hitmap engine so that the same click isn't handled twice.

## Technical requirements

- DOM construction via direct `document.createElement` — no virtual DOM, no framework dependency. This is the framework-agnostic core.
- Each `HitmapItem` becomes exactly one host element:
  - `role: "button"` / `"link"` → `<button>` (or `<a>` if `intent.href`).
  - `role: "textbox"` + `input.kind = "text" | "password" | "email" | ...` → `<input type=...>`.
  - `role: "textbox"` + `input.kind = "textarea"` → `<textarea>`.
  - `role: "checkbox"` → `<input type="checkbox">` with ARIA.
  - `role: "slider"` → `<input type="range">`.
  - `role: "combobox"` / `"listbox"` → real `<select>` with `<option>` children generated from `intent.payload.options`.
  - Unknown roles → `<div role="..." tabindex="0">` with appropriate ARIA.
- **Invisibility strategy**: `color: transparent`, `caret-color: var(--sk-caret, currentColor)`, `background: transparent`, `border: none`, `outline: none` by default, but glyphs and caret remain visible for text inputs. Custom focus ring is drawn by the effects layer (prompt 11). All elements use `isolation: isolate`, `transform: translate3d(...)` for subpixel accuracy, and `pointer-events: auto`.
- **Positioning**: absolute within a container that overlays the canvas 1:1. Positions recomputed from hitmap regions via `CoordinateMapper.keyframeToViewport`. For polygon regions, use `clip-path: polygon(...)` so hit areas match non-rectangular shapes.
- **Reconciliation**: on scene commit, diff old hitmap vs. new, reuse elements where `id` and `role` match (preserves focus, IME composition, typed values if declared preserved), destroy + create otherwise.
- **State store bridge**: every input's `input`/`change`/`blur` event produces a JSON Patch op against the scene's state; publish via the overlay's `onStateChange` channel. Intent activations (button clicks, `Enter` on inputs with `submit: true`) publish via `onIntent`.
- **Focus management**: when a scene commits, move focus to an item tagged `autofocus: true`, or preserve it if the previous focus `id` exists in the new hitmap. Respect user-initiated focus (never steal focus mid-interaction if the user is typing elsewhere in the page).
- **Accessibility**: ARIA live region (`aria-live="polite"`) announces the new scene's `ariaSummary` on commit. Role-specific semantics fully populated. Keyboard traps for modal scenes when declared.

## Public API

```ts
interface DomOverlay {
  mount(host: HTMLElement, mapper: CoordinateMapper): Disposable;
  commit(hitmap: Hitmap, opts?: CommitOpts): void;
  setState(delta: JsonPatchOp[]): void;      // external state updates (e.g. server push)
  readonly onIntent: EventSource<IntentFired>;
  readonly onStateChange: EventSource<StateDelta>;
  readonly onFocus: EventSource<{ id: string | null }>;
  destroy(): void;
}

interface CommitOpts {
  autofocusId?: string;
  preserveFocusWherePossible?: boolean; // default true
  announceSummary?: string;
}
```

## Coordination with the hitmap engine

- The hitmap engine (prompt 05) observes pointer events via `pointerdown` on the canvas. The overlay's real elements handle actual clicks/keyboard natively.
- Rule: if a pointer event is consumed by a real `<input>` / `<button>` (native), do not also dispatch a synthetic intent from the hitmap engine. Wiring: hitmap engine's event source checks `event.target.closest('[data-sk-overlay-item]')` and suppresses synthesis when present.
- Conversely, if the canvas receives a click outside any overlay element (e.g. on a decorative region), the hitmap engine publishes; the overlay ignores.
- Focus changes flow both ways: overlay's `onFocus` reflects native focus; hitmap engine's `focus(id)` calls `element.focus({ preventScroll: true })`.

## Implementation mandates

- No dependency on any framework. React/Vue/Svelte adapters live in separate packages.
- No CSS-in-JS runtime. Ship a single static stylesheet `overlay.css` that consumers import.
- Every element gets `data-sk-overlay-item="<id>"` for inspection and delegated event filtering.
- Polygons: use `clip-path: polygon(...)` with keyframe coords transformed to percentages relative to the element's bounding rect.
- Text inputs declare `autocomplete` attributes inferred from `input.name` (`current-password`, `email`, `cc-number`, etc.) when a declared mapping exists.
- `aria-describedby` points to a sibling `<span class="sr-only">` holding the `ariaSummary`.
- Every element has a unique `id` stable across commits when possible.
- IME composition events (`compositionstart`/`compositionupdate`/`compositionend`) suppress state push during composition; commit on `compositionend`.
- `contenteditable` is not used.
- Form submission semantics: scene declares `"form": { submitIntent, submitOn: "enter" | "button" }`. Enter key on a form input triggers the submit intent with all field values merged into the payload.

## Test plan

- Playwright tests (real browsers):
  - Type into an overlay text input; assert `<input>` value matches typed string and a `StateDelta` was emitted with the correct path.
  - Tab through a 5-item hitmap; every item receives focus in order; `Enter` on a button fires `IntentFired` exactly once.
  - Password manager integration: set `input.name = "password"` and `input.kind = "password"`; assert `<input type=password autocomplete=current-password>`.
  - Screen reader: use `@testing-library` with `axe-core`; assert zero WCAG 2.1 AA violations.
  - Commit two scenes sharing an item id with `role: "textbox"`; assert the `<input>` value survives the commit.
  - Polygon region: verify native click outside the polygon does not register (bounding box click filtered by `clip-path`).
  - IME: simulate Korean composition sequence; assert state delta fires once at `compositionend`, not per keystroke.
- Memory: 100 consecutive commits with varying hitmaps; zero detached nodes after a full GC (verify with `performance.measureUserAgentSpecificMemory`).

## Deliverables

- `packages/client-core/src/overlay/{overlay.ts,elements.ts,reconcile.ts,styles.ts,types.ts}` plus tests.
- `packages/client-core/src/overlay/overlay.css` — static stylesheet, documented.
- `packages/client-core/README-overlay.md` — the "text input cheat" explained with diagrams.

## Acceptance criteria

- Playwright tests green in Chromium, Firefox, WebKit.
- `axe-core` reports zero violations on every seeded hitmap fixture.
- Zero detached nodes after repeated commits.
- A scene with a visible `<input>` correctly integrates with Chrome's password manager (manual verification + snapshot with browser extension installed in Playwright).

## Non-goals

- No canvas drawing (prompt 04).
- No effects / focus rings (prompt 11).
- No scene routing (prompt 07).
- No React bindings (prompt 10).
- No a11y tree construction beyond standard ARIA attributes (prompt 13 builds higher-level coordination on top).
