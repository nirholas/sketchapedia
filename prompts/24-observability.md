# 24 — Observability

## Project context

Sketchapedia's operational posture is a distributed pipeline: client → gateway → orchestrator → (LLM, image, video, vision) → cache → CDN → client. Every boundary must emit traces, metrics, and structured logs. Without this, debugging latency regressions or quality regressions is impossible. See `prompts/00-vision.md`.

## Your task

Implement `packages/observability/` — a shared OpenTelemetry helper library plus runnable Grafana dashboards, Prometheus scrape configs, OTel Collector pipeline, and a logging specification. Used by every server-side package; client emits lightweight browser-side telemetry to a dedicated ingestion endpoint.

## Technical requirements

- Traces, metrics, logs via **OpenTelemetry**; OTLP exporter.
- Collector: **OpenTelemetry Collector** with pipelines routing to:
  - Traces → **Grafana Tempo**
  - Metrics → **Prometheus** (scraped)
  - Logs → **Loki**
- Optional commercial targets: Honeycomb, Datadog (adapters in the collector config).
- Semantic conventions: use `@opentelemetry/semantic-conventions`; extend with `sketchapedia.*` namespace for domain attrs (`scene.id`, `scene.cache_source`, `scene.latency_stage`, etc.).
- Client telemetry: a tiny browser SDK (part of `client-core`) posts `navigator.sendBeacon` batches to `/telemetry/ingest`; batched every 5s or on page hide.

## Exposed library (shared)

```ts
import { tracer, meter, logger, withSpan } from "@sketchapedia/observability";

await withSpan("orchestrator.generate", { attrs: { tenantId, intentName } }, async (span) => {
  // ...
});

const sceneCommits = meter.createCounter("sketchapedia.scene.commits");
sceneCommits.add(1, { source: "cache" });
```

Helpers:
- `traceparentFromRequest(req)` / `injectIntoHeaders(headers)` for propagation.
- `instrumentHono(app)`, `instrumentBunServer(server)`, `instrumentRedis(client)`, `instrumentAwsSdk(client)`.
- `errorRecord(err, span)` attaches `exception.*` attributes and sets span status.
- `pinoTransport()` emits structured logs to OTel with trace correlation.

## Dashboards (Grafana JSON)

All committed under `observability/dashboards/`:

1. **System health** — RPS, error rate, p50/p95/p99 latency per service.
2. **Gateway** — active WS connections, rate-limit rejections, session resumes.
3. **Orchestrator** — intents/sec, cache hit rate, saga step latency, tenant fairness (p95 per tenant).
4. **Models** — per-model queue depth, GPU time, VRAM peak, success rate, content-filter rate.
5. **Vision correction** — mean IoU over time (quality regression alert).
6. **Cache server** — reads/writes, S3 latency, GC pressure, bytes stored per tenant.
7. **Edge** — cold vs. warm, region breakdown, cache hit rate at edge.
8. **Client** — scene commit latency by source (cache/memory/generated), frame drop rate, JS error rate, a11y violation alerts from dev builds.
9. **Cost** — GPU spend per tenant per day; cache-miss cost.

## SLOs

Encoded as `observability/slos/*.yaml`:

- **Scene commit p95** ≤ 4s (cache miss, models warm).
- **Scene commit p95** ≤ 200ms (cache hit).
- **Edge artifact p99** ≤ 100ms.
- **Gateway availability** ≥ 99.9%.
- **Mean vision IoU** ≥ 0.7 (quality SLO).

Alerts (Alertmanager rules) trigger on burn-rate over 1h/6h windows.

## Client telemetry minimums

- Scene commit latency, source, sceneId hash (privacy-scrubbed).
- Router transitions count per session.
- Cache hit/miss counts.
- Decoder errors + recovery.
- Unhandled errors (with source map support via `sentry`-compatible endpoint if configured).

**No PII**. No user text. No state values. Explicit allowlist of field names.

## Implementation mandates

- Sampling: 100% traces in dev, 10% in prod (adjustable); errors always sampled.
- Trace propagation is transparent across HTTP, WS, and BullMQ jobs.
- Cost of instrumentation under 2% CPU overhead measured.
- Dashboards provisioned via IaC (prompt 33) so they're reproducible.
- Log redaction at the transport: `tenantId` hashed, `userId` hashed; user-provided text never logged.

## Test plan

- Integration tests spin the collector as testcontainers; emit a trace; assert it lands in Tempo and dashboard query returns the expected series.
- Cardinality: verify tenant tag count bounded; no attribute explosion from unbounded values.
- Load: 10k spans/s sustained across dev harness without dropped spans.

## Deliverables

- `packages/observability/src/*`.
- `observability/collector/config.yaml`.
- `observability/dashboards/*.json`.
- `observability/slos/*.yaml`.
- `packages/observability/README.md`.

## Acceptance criteria

- All services emit correlated traces end-to-end (verified by a smoke test that follows a single request from client to CDN and back).
- Dashboards render populated data against a seeded environment.
- SLO burn-rate alerts fire correctly in a fault-injection test.

## Non-goals

- No business analytics (that's consumer-level).
- No vendor-specific proprietary SDKs — OTel is the interface.
