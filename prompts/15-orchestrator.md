# 15 — Scene Generation Orchestrator

## Project context

The orchestrator is the brain of the Sketchapedia backend. It receives an intent + state context from the gateway, checks the server-side cache, and — on a miss — drives the LLM → image → (video) → vision-correction pipeline to produce a fully-formed `Scene` plus artifacts. It emits progress events, writes to the cache, and streams results back. See `prompts/00-vision.md`.

## Your task

Implement `packages/server-orchestrator/` in TypeScript (Bun). Coordinates the model services (prompts 16–19), the cache (prompt 20), and the GPU dispatcher (prompt 22). Designed for horizontal scale and per-tenant fairness.

## Technical requirements

- Runtime: Bun.
- Communication with gateway: HTTP/2 server (Hono on Bun) with SSE for streaming progress, or bidirectional gRPC (`@grpc/grpc-js`). **Chosen: HTTP/2 + SSE** for simplicity and debuggability; gRPC wrapper optional for internal perf.
- Job queue: **BullMQ** backed by Redis, with fairness per `tenantId`. Jobs carry `priority: user | prefetch`.
- Concurrency: bounded workers per node (CPU-pinned); GPU work dispatched to the GPU pool (prompt 22).
- Saga pattern: the generation pipeline is a sequence of steps with compensation on failure. If the video model fails, the already-generated keyframe can still be committed.
- Idempotency: each intent request has a request id; retries (from the client or gateway) never duplicate GPU work.

## Pipeline steps (saga)

1. **Derive cache key** via `@sketchapedia/cache-keys`.
2. **Cache lookup** — if hit, return immediately with `source: "cache"`.
3. **Emit `layout` progress**; call LLM layout generator (prompt 16) → `{ layoutSpec, hitmapDraft, imagePrompt, videoPrompt }`.
4. **Emit `image` progress**; call image model (prompt 17) conditioned on previous keyframe → `keyframeBytes`.
5. **Emit `vision` progress**; call vision correction (prompt 19) on the generated keyframe + hitmap draft → `hitmap` with grounded coordinates.
6. **Assemble `Scene`**: compute content-addressed IDs for artifacts, upload to cache storage (prompt 20), build `Scene` object.
7. **Emit `SceneReady`** via SSE.
8. **Async step** — start video transition generation (prompt 18) from `fromKeyframe` to `keyframeBytes`; on completion emit `TransitionReady`. Client may commit on keyframe alone if transition fails or times out.

## Inputs / Outputs

```ts
POST /generate { intent, previousSceneId, stateDelta, styleRef, tenantId, userId }
→ SSE stream: progress → SceneReady → TransitionReady

POST /cancel { requestId }
→ { cancelled: boolean }
```

Each outbound frame is CBOR-encoded `ServerMessage` from `@sketchapedia/protocol`.

## Implementation mandates

- Compensating actions: if a step fails mid-saga, already-written artifacts are marked reclaimable but not immediately deleted (lazy GC every hour).
- Deadline budget: default 8 seconds end-to-end. Each step has a sub-deadline; tail-step timeouts fall back to partial results (e.g. no video clip).
- **Prompt-injection defense**: user-supplied text in state deltas is passed to the LLM inside a sandboxed template; LLM output is schema-validated and coordinates/URLs are hard-constrained. See prompt 26 for broader policy.
- Cache-write errors never block scene delivery to the client, but surface a critical telemetry event.
- Each request gets a W3C trace; every step emits a span under it.
- Tenant fairness: BullMQ priority groups rotate round-robin across tenants; a single spammy tenant cannot starve others.
- Circuit breakers around each model client: open on 50% failure rate across 10s window, half-open probes every 30s.

## Test plan

- Integration tests against real LLM and image model endpoints with a dedicated test tenant, guarded by API keys stored in CI secrets. No mocks.
- Deterministic prompt set: 10 intent/state fixtures that produce valid scenes end-to-end; assertions verify `Scene` is well-formed (hitmap items are inside the keyframe, aria labels non-empty, etc.).
- Saga compensation: simulate video model failure (configured via test-only feature flag in the model client); verify `SceneReady` still emits.
- Load test: 50 concurrent generation requests; verify fairness across tenants by inspecting BullMQ metrics.
- Cache integration: a repeat request returns `source: "cache"` within 50ms.

## Deliverables

- `packages/server-orchestrator/src/{server.ts, pipeline.ts, queue.ts, sagas/*.ts, config.ts, telemetry.ts}`.
- Dockerfile.
- Integration tests against live model services.
- `packages/server-orchestrator/README.md` — deploy guide, scaling guidance, SLO definitions.

## Acceptance criteria

- p50 end-to-end cache-miss latency ≤ 4s (with models warm); p95 ≤ 8s.
- Cache hit latency ≤ 50ms.
- Saga compensation tested for each step.
- Tenant fairness: under load, no tenant sees p95 > 2× the global p50.

## Non-goals

- No model inference logic here (prompts 16–19).
- No WebSocket handling (prompt 14).
- No scene storage (prompt 20).
