# 23 — Developer Tools (Scene Inspector)

## Project context

Debugging a generative UI is harder than debugging DOM: you can't "inspect element" on pixels. Sketchapedia ships a dev inspector that visualizes the hitmap over the canvas, shows scene state, logs intent dispatches, surfaces cache hits/misses, replays the scene history, and exposes the router's state machine in real time. It's the developer's superpower. See `prompts/00-vision.md`.

## Your task

Implement `packages/devtools/` — an inspector panel injected into consumer apps (rendered only when `NODE_ENV !== "production"` by default; can be opened in prod behind a feature flag). Rendered as an overlay pane attached to the client, not a separate dev-only app.

## Technical requirements

- Built as a standalone React widget consuming the public `SceneRouter` + `ClientCache` + `EffectsLayer` APIs — no private imports.
- Self-contained styling (CSS modules or inline); must not visually pollute the host app.
- Keyboard toggle: `Ctrl+Shift+I` (configurable); avoid collision with browser devtools.
- Resizable + draggable; persists layout in `localStorage`.

## Panels

1. **Canvas overlay** — toggleable: draws hitmap polygons over the canvas with labeled regions, role-colored outlines, item ids. Click-to-select highlights an item and shows its metadata.
2. **Scene tree** — current scene id, hash, cache source, generation latency, artifact URLs.
3. **State inspector** — live view of scene state (JSON) with per-field editor for ad-hoc testing.
4. **Intent log** — chronological list of dispatched intents with timestamps, outcomes, latency breakdowns (cache → transport → render → commit).
5. **Router state machine** — XState inspector integration showing current state and allowed transitions.
6. **Pending generations** — in-flight server requests, progress bar, cancel button.
7. **Cache stats** — hit rate, bytes cached, pinned entries, eviction events.
8. **Effects HUD** — frame time graph, draw calls, GPU time (WebGPU only).
9. **A11y tree** — live dump of the accessible tree, with contrast-checker on text + focus indicators.
10. **Record / replay** — record a session (intents + state deltas); replay into a fresh SDK instance for repro.
11. **Network panel** — WebSocket frames in/out with decoded CBOR, filterable.
12. **Performance flamegraph** — captures a span tree for the last N scene commits.

## Public API

```tsx
import { SceneInspector } from "@sketchapedia/devtools";
<SceneInspector
  router={router}
  cache={cache}
  effects={effects}
  hotkey="ctrl+shift+i"
  initiallyOpen={false}
/>
```

## Implementation mandates

- Zero impact when closed: no DOM nodes beyond a toggle button (lazy-loaded pane).
- Network panel decodes CBOR lazily; never caches raw bytes beyond 50 MiB.
- Record/replay serializes to JSON; roundtrip integrity verified (prompt 07's `serialize`/`hydrate`).
- State inspector edits flow through `router.applyStateDelta` — never mutates objects directly.
- Accessibility: the inspector itself is WCAG-compliant and keyboard-operable.
- Built with React 19; lazy-loads heavy sub-panels (flamegraph, record/replay).
- Types strict; no access to internals of any SDK package via casts.

## Test plan

- Mount the inspector against a running reference app in Playwright.
- Scenarios:
  - Toggle via hotkey; panel opens; overlay draws polygons.
  - Dispatch an intent from the UI; intent log records it within 50ms.
  - Edit a field in state inspector; router applies; scene reacts.
  - Record a 10-intent session; replay in a fresh instance; final state matches original snapshot.
  - Axe-core: no a11y violations on the inspector itself.
  - Production build has dead-code elimination stripping the inspector from bundles that don't import it.

## Deliverables

- `packages/devtools/src/{inspector.tsx, panels/*.tsx, record.ts, replay.ts, overlay.tsx, types.ts}`.
- `packages/devtools/README.md` — screenshot walkthrough + how to extend with custom panels.
- Tests.

## Acceptance criteria

- All scenarios green.
- Inspector bundle size < 120 KB gzipped (lazy panels excluded).
- Integrates cleanly with reference apps.

## Non-goals

- No backend/server debugging (that's in observability, prompt 24).
- No production analytics dashboards (out of scope).
