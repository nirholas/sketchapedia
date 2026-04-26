# 07 — Scene Graph & Intent Router

## Project context

Sketchapedia's client runs a local state machine: each `Scene` is a state, each `Intent` is a transition. Most intents resolve from the cache; novel ones round-trip to the server. The router decides when to optimistically commit, when to await, when to play a transition clip, when to replay on server error. It sits between the hitmap/overlay (intent sources) and the transport + cache (intent resolvers). See `prompts/00-vision.md`.

## Your task

Implement `packages/client-core/src/router/` using **XState v5**. Expose a clean API for dispatching intents, subscribing to scene changes, inspecting pending generations, and managing the transition lifecycle.

## Technical requirements

- State machine modeled with XState v5 `createMachine` + `createActor`.
- Primary states: `idle`, `resolving`, `awaiting_server`, `playing_transition`, `committed`, `error_recovery`.
- Transient states for optimistic commit when cache hits synchronously.
- Effects: side-effect invocations (`fromPromise`, `fromCallback`) call into injected service ports — never bind transport/cache directly to the machine.
- **Deterministic replay**: every intent, scene commit, and transition is recorded into an append-only in-memory log; the router can be rehydrated from the log plus an initial scene (used by the dev tools in prompt 23 and for crash recovery).

## Ports (injected, not imported)

```ts
interface SceneRouterPorts {
  cache: {
    lookup(key: CacheKey): Promise<CacheHit | null>;
    put(key: CacheKey, scene: Scene, transition?: TransitionRef): Promise<void>;
  };
  transport: {
    request(intent: ClientIntent, signal: AbortSignal): AsyncIterable<ServerMessage>;
  };
  renderer: {
    commitScene(scene: Scene, source: KeyframeSource): Promise<void>;
    playTransition(transition: TransitionSource): Promise<void>;
  };
  overlay: {
    commit(hitmap: Hitmap, opts?: CommitOpts): void;
    setState(delta: JsonPatchOp[]): void;
  };
  clock: { now(): number };
  telemetry: TelemetryBus;
}
```

## Public API

```ts
class SceneRouter {
  constructor(ports: SceneRouterPorts);

  start(rootScene: Scene): void;
  dispatch(intent: IntentFired): Promise<DispatchResult>;
  applyStateDelta(delta: JsonPatchOp[]): void;
  abort(reason?: string): void;

  readonly state: Observable<RouterState>;       // derived state for UI subscribers
  readonly scene: Observable<Scene>;
  readonly pending: Observable<readonly PendingGeneration[]>;
  readonly history: readonly HistoryEntry[];     // deterministic replay log

  // Dev tools support
  serialize(): RouterSnapshot;
  hydrate(snapshot: RouterSnapshot): void;
}
```

## Dispatch algorithm

1. Compute `CacheKey` via `@sketchapedia/cache-keys` from `(currentSceneId, intent, stateDelta, styleRef, modelChannel)`.
2. `cache.lookup(key)`:
   - **Hit with transition**: play transition via renderer; on completion, swap overlay hitmap; commit. State transitions: `idle → playing_transition → committed`.
   - **Hit without transition**: crossfade fallback via renderer; commit.
   - **Miss**: enter `awaiting_server`. Open transport stream; as messages arrive, update `pending`. On `SceneReady`, begin committing optimistically (keyframe first, then transition). On `ErrorFrame`, either retry (retriable) or bubble to `error_recovery`.
3. Intent dispatched during `awaiting_server` is *queued* if it targets the pending scene, *coalesced* if it targets the current scene and is idempotent (e.g. a duplicate tap), *cancelled* if the user has moved on.
4. A `StateDelta` arriving during `playing_transition` is applied to the overlay immediately (it represents server confirmation of a pre-existing field, not a scene change).

## State preservation

- On commit, merge old state + new `stateSchema` defaults + any inbound `StateDelta` in that order.
- Field values present in both old and new scenes are preserved when the new `stateSchema` keeps their shape.
- Form-submit intents carry the full current state as payload.

## Error recovery

- `ErrorCode.MODEL_TIMEOUT`: retry once with 500ms backoff + jitter; surface error if second attempt fails.
- `ErrorCode.RATE_LIMITED`: honor `retryAfter` in payload; block new dispatches from this scene for the window.
- `ErrorCode.VERSION_MISMATCH`: emit a fatal event; consumer SDK shows a "please refresh" surface.
- `ErrorCode.CONTENT_FILTERED`: commit a safe-fallback scene declared by the app (`rootScene.onContentFilteredFallback`).
- Network drops mid-stream: client already committed the keyframe → treat transition as dropped (use crossfade retroactively if available from cache).

## Implementation mandates

- State machine diagram committed as `packages/client-core/src/router/machine.md` with a Mermaid graph.
- No direct imports of transport, cache, or renderer modules — only through ports.
- Intents are value objects; never mutate payloads after dispatch.
- Observables implemented via a lightweight internal helper; no RxJS dependency.
- History log bounded (default 200 entries) to prevent unbounded memory growth.

## Test plan

- XState visualizer snapshots checked in; changes to the machine require updating the snapshot.
- Simulated ports: use fakes in tests (fakes are acceptable in tests; production code has no mocks — see the project-wide quality bar).
- Scenarios:
  - Cache hit produces zero transport calls and commits within 20ms.
  - Cache miss serializes through transport; commits after `SceneReady`.
  - Rapid duplicate intents while `awaiting_server` coalesce into one.
  - User clicks a different intent mid-generation: the first is cancelled (AbortSignal fired), the second starts.
  - Server sends `GenerationProgress` → router exposes it via `pending`.
  - Serialize → new router + hydrate produces byte-equal observable state and identical history log.

## Deliverables

- `packages/client-core/src/router/{machine.ts, router.ts, types.ts, ports.ts, observable.ts}`.
- Tests including XState model-based test generation (`@xstate/test`).
- `packages/client-core/README-router.md`.

## Acceptance criteria

- All scenarios green with deterministic timing.
- Model-based tests cover all reachable states.
- No direct import of transport/cache/renderer modules from inside `router/`.
- `hydrate(serialize(...))` is idempotent.

## Non-goals

- No transport implementation (prompt 09).
- No cache implementation (prompt 08).
- No DOM work (prompts 04–06).
- No framework bindings (prompt 10).
