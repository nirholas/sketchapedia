# 10 — React Bindings

## Project context

`@sketchapedia/client-core` is framework-agnostic. React is the most common consumer. This package, `@sketchapedia/client-react`, wraps the core with React 19-idiomatic components, hooks, and Suspense integration so a developer can drop `<Sketchapedia />` into a page and get a fully functional MaaR UI. See `prompts/00-vision.md`.

## Your task

Implement `packages/client-react/` with a `<Sketchapedia>` component, hooks for scene state, intent dispatch, router observation, cache control, Suspense bridges for loading transitions, and a `<SketchapediaProvider>` at the root. Compatible with React 19 strict mode, concurrent rendering, and server components (package must declare `"use client"` where appropriate and not import browser-only modules at evaluation time on the server).

## Technical requirements

- React 19.
- No dependencies beyond `react`, `react-dom`, `@sketchapedia/client-core`, `@sketchapedia/protocol`.
- Built as ESM with a separate `client` subpath that carries `"use client"` banner so Next.js / Remix server components can opt into client rendering cleanly.
- Tree-shakable.
- Typed ref forwarding on every component.

## Components

```tsx
<SketchapediaProvider
  config={{ serverUrl, authTokenProvider, cacheBudgetMb, locale, reduceMotion }}
>
  {children}
</SketchapediaProvider>

<Sketchapedia
  rootScene={rootScene}
  onSceneChange?={(scene) => void}
  onError?={(error) => void}
  className?={string}
  style?={CSSProperties}
  fitMode?={"contain" | "cover" | "stretch"}
  ref={ref}
/>

<SceneInspector /> // renders dev tools panel when NODE_ENV !== production
```

## Hooks

```ts
// Read current scene and pending state
const scene = useScene();
const pending = usePending(); // PendingGeneration[]

// Read / write a specific field in the scene's declared state
const [value, setValue] = useFieldState<T>("path.to.field");

// Dispatch an intent programmatically
const dispatch = useIntent();
await dispatch({ name: "open_reservation", payload: {} });

// Preload likely next scenes
usePrefetch([{ intent: "browse_menu" }, { intent: "browse_rooms" }]);

// Observe transport state
const status = useTransportStatus(); // "connected" | "reconnecting" | ...

// Low-level router access (advanced)
const router = useRouter();
```

## Suspense integration

- A promise adapter lets components `useScene()` suspend when the next scene is mid-generation and the developer opts in via `<Suspense fallback={<Skeleton/>}>`.
- Default behavior (no Suspense wrap) is non-suspending: current scene stays mounted, `pending` surfaces progress via `usePending`.

## Implementation mandates

- No `useEffect` for initial subscriptions where `useSyncExternalStore` is correct.
- `<Sketchapedia>` mounts core lifecycle (renderer, hitmap engine, overlay, router, transport, cache) exactly once per mount; teardown is complete and idempotent (no leaks when remounting rapidly).
- Strict mode: double-invocation of effects must not cause duplicate connections or duplicate overlay DOM.
- Refs: `Sketchapedia` forwards a ref that exposes `{ dispatch, router, snapshot(): RouterSnapshot }`.
- Error boundary: an internal `<ErrorBoundary>` catches rendering errors, logs telemetry, and offers a retry path; customizable via `errorFallback` prop.
- `reduceMotion` honored: when true, all transitions are instant crossfades.
- Locale forwarded to the server in `ClientHello.capabilities` so generated UIs render in the correct language; a `useLocale` hook lets apps switch at runtime, which triggers a `change_locale` intent.

## Accessibility wiring

- The provider injects a visually-hidden `<div aria-live="polite">` for scene summary announcements.
- Focus management on mount: if a scene declares an `autofocusId`, the overlay focuses it, and the React tree respects the user's `autoFocus` override when provided on the component.
- Keyboard shortcut to open `<SceneInspector>` (default `Ctrl+Shift+I`), configurable.

## Test plan

- `@testing-library/react` with `vitest` for unit behavior.
- Playwright for real browser (covers interaction flows that TLR can't — canvas pixel assertions, IME).
- Scenarios:
  - Mount `<Sketchapedia>`; observe scene commits; unmount; no warnings in strict mode.
  - `useFieldState`: setting a value propagates as a JSON Patch; server round-trip not required for local-only fields.
  - `useIntent`: dispatch fires; returns a promise resolving on commit.
  - `<Suspense>` fallback renders during a slow generation; primary UI replaces on commit.
  - Re-render storm (1000 concurrent `setFieldState`): no lost updates, batched sanely.
  - Error boundary catches a router error; `errorFallback` renders; retry reconnects.

## Deliverables

- `packages/client-react/src/{provider.tsx, sketchapedia.tsx, hooks.ts, error-boundary.tsx, inspector.tsx, types.ts}`.
- Tests.
- `packages/client-react/README.md` with a "Hello world" example that a dev can paste into a Next.js app.

## Acceptance criteria

- Works in Next.js 15 app-router (tested via a fixture app in `tests-e2e/next-integration/`).
- Zero "Warning: Cannot update a component while rendering a different component" under strict mode.
- Tree-shakes: a bundle analyzer on `<Sketchapedia>` alone leaves `<SceneInspector>` out.
- No server-side evaluation crashes when imported from a React Server Component (exports are correctly marked `"use client"`).

## Non-goals

- No Vue / Svelte / Solid bindings in this package (future work).
- No styling system beyond minimal structural CSS.
- No SSR rendering of the canvas itself (impossible; the canvas is hydrated client-side).
