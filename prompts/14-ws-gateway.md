# 14 — WebSocket Gateway

## Project context

Sketchapedia's server-side entry point. Clients connect here over `wss://`; the gateway authenticates, rate-limits, enforces tenant isolation, and proxies intents to the orchestrator (prompt 15). It terminates TLS, handles reconnection/resumption, backpressures intents, and emits per-request telemetry. See `prompts/00-vision.md`.

## Your task

Implement `packages/server-gateway/` using **Bun** and **Hono**. This is a first-class production service: horizontal scaling, graceful shutdown, structured logging, OTel tracing, and zero-downtime deploys.

## Technical requirements

- Runtime: **Bun ≥ 1.1** with native WebSocket server (`Bun.serve({ websocket })`).
- Framework: **Hono** for HTTP routes (`/healthz`, `/readyz`, `/metrics`, `/ws`).
- Observability: **OpenTelemetry** (traces, metrics, logs) via `@opentelemetry/api` + OTLP exporter (prompt 24).
- Structured logging: **pino** with trace context injection.
- Auth: **JWT (RS256)** issued by upstream identity service; validated on connect. Claims include `tenantId`, `userId`, `roles[]`, `quotas`.
- Rate limiting: **token bucket per tenant + per user**. Enforced in Redis (tenancy-aware keys). Reject with `ErrorFrame { code: RATE_LIMITED, retryAfter }`.
- Tenant isolation: every request tagged with `tenantId`; downstream (orchestrator, cache) keys include tenant id.
- WebSocket message validation via `@sketchapedia/protocol` on every frame — invalid frames return an `ErrorFrame { code: INVALID_INTENT }` and close the connection if persistent.
- Session resumption: the gateway issues `sessionId` in `ServerHello`. On reconnect, client replays hello with the old `sessionId`; if present in Redis (TTL 5 min) and its in-flight intents are still processing, subscriptions resume without duplicate work.
- Heartbeat: server sends `ServerHeartbeat` every 20s; closes socket after 60s silence.
- Graceful shutdown: on `SIGTERM`, stop accepting connections, drain existing within a 30s window, fail over in-flight requests to transient errors for client retry.

## Endpoints

- `GET /healthz` → 200 when process alive.
- `GET /readyz` → 200 when Redis and orchestrator are reachable.
- `GET /metrics` → Prometheus-format metrics (`wsConnectionsActive`, `intentsPerSecond`, `intentLatencySeconds_bucket`, `rateLimited`, etc.).
- `WS /ws` → WebSocket upgrade.

## Architecture

```
Client WS ↔ Gateway (stateless, HPA)
           ↔ Redis (session state, rate limit tokens)
           ↔ Orchestrator (gRPC / NATS / Bun HTTP — see prompt 15)
```

## Implementation mandates

- Zero-copy binary frames: CBOR payloads passed through as `Uint8Array` without JSON intermediate.
- Per-connection `AbortController` cancels downstream work on disconnect.
- Backpressure: if the orchestrator queue for a tenant is saturated, respond with `ErrorFrame { code: BACKPRESSURE, retryAfter: jitterMs }`.
- Prompt-injection defense: payload sanitation deferred to orchestrator, but size caps and schema enforcement live here.
- Secrets from **env only**; `DATABASE_URL`, `REDIS_URL`, `ORCHESTRATOR_URL`, `JWT_PUBLIC_KEY`, `OTEL_EXPORTER_OTLP_ENDPOINT`, etc. Validated at boot with Zod.
- Deployments as stateless containers; horizontal autoscaling on CPU + active WS count.
- TLS terminated upstream at the load balancer in production; in development, the gateway can self-terminate with `wrangler`-style local cert.

## Test plan

- Vitest + Bun test runner.
- Integration harness spins up Redis (testcontainers) and a stub orchestrator that implements the real wire protocol (not a mock of its logic — a conformant server that returns deterministic scenes for testing).
- Scenarios:
  - JWT validation: expired token rejected with `AUTH_FAILED`.
  - Rate limit: 100 intents in 1s from one tenant → bucket empties → subsequent rejected.
  - Session resumption: disconnect + reconnect with same `sessionId` → in-flight subscription resumes.
  - Graceful shutdown: `SIGTERM` triggers drain; new connects rejected; existing finish cleanly.
  - Large payload > 4MiB rejected with `INVALID_INTENT`.
  - Invalid CBOR rejected with violation; socket closed after 3 violations.
- Load test: `k6` script pushing 1 000 concurrent connections × 10 intents/s; p95 latency < 10ms gateway overhead (excluding downstream).

## Deliverables

- `packages/server-gateway/src/{server.ts, websocket.ts, auth.ts, ratelimit.ts, session.ts, metrics.ts, shutdown.ts, config.ts}`.
- `packages/server-gateway/Dockerfile`, `bunfig.toml`, health script.
- `packages/server-gateway/test/` integration + load tests.
- `packages/server-gateway/README.md` — config env table, deploy guide.

## Acceptance criteria

- All tests green.
- `k6` load test passes latency targets.
- `docker run` boots cleanly with required env; crashes with a clear error when required env missing.
- Grafana dashboard JSON ships under `observability/dashboards/gateway.json` (prompt 24).

## Non-goals

- No model orchestration (prompt 15).
- No cache logic (prompt 20).
- No user provisioning (prompt 26).
