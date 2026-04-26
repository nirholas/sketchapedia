# 22 — GPU Dispatcher

## Project context

The model runtimes (prompts 17, 18, 19) need GPUs. Cold-booting a FLUX pipeline takes ~60s; cold-booting LTX-Video takes ~40s. Sketchapedia can't pay that on every user request. The GPU dispatcher maintains a warm pool of instances per model family, routes requests to a healthy instance, handles scale-up / scale-down, and survives failures. See `prompts/00-vision.md`.

## Your task

Implement `packages/gpu-dispatcher/` — a control-plane service that fronts **Modal** (primary) and **RunPod** (secondary) serverless GPU providers, managing warm pools and routing. Exposes a unified HTTP + client API used by the orchestrator (prompt 15).

## Technical requirements

- Runtime: Bun + Hono.
- Providers:
  - **Modal**: Python functions deployed with `@stub.function(gpu=...)` for each model (`image`, `video`, `vision`). Dispatcher calls the Modal HTTP endpoints.
  - **RunPod**: serverless endpoints with a matching contract. Adapter layer isolates differences.
- **Warm pool policy** per model family:
  - Minimum warm instances per region (default 2).
  - Scale-up trigger: queue depth > 3 or p50 latency > 2× baseline.
  - Scale-down: idle for 5 min → deprovision.
  - Max instances: configurable per-tenant budget.
- **Health**: instances heartbeat every 10s; missed → quarantined; replaced.
- **Routing**: round-robin + least-loaded; sticky for LoRA affinity (keeping LoRAs resident on the same instance).
- **Failover**: primary provider failure → switch to secondary; announced via OTel events.

## API

```
POST /dispatch
{
  "model": "image" | "video" | "vision",
  "payload": { ... },               // forwarded to the model server
  "tenantId": "...",
  "priority": "user" | "prefetch",
  "timeoutMs": 8000,
  "lora": [{ "name": "...", "uri": "..." }]    // optional; pins to an instance with this LoRA loaded
}
→ SSE stream forwarded from the model; final 200 with result.
```

Internal: `/pool/stats`, `/pool/drain`, `/pool/scale`.

## Implementation mandates

- Zero vendor lock-in at the call site: orchestrator speaks to the dispatcher only.
- Deadline propagation: `timeoutMs` enforced locally + passed downstream.
- Request IDs embedded in Modal function invocations for distributed tracing.
- Cost tagging: every call logs `provider`, `gpu_sku`, `latency_ms`, `vram_peak_mb` so finance can attribute spend.
- Safe scale-down: never deprovision an instance with in-flight work; drain-first policy.
- LoRA resident strategy: dispatcher tracks which instances have which LoRAs loaded; routes preferentially; instance LRU-evicts LoRAs when memory tight.
- Rate-limit by tenant budget.

## Modal integration specifics

- **Modal app** defined in `packages/gpu-dispatcher/modal/app.py` with stubs `image_fn`, `video_fn`, `vision_fn` — each imports its respective server (prompts 17/18/19) and exposes an HTTPS endpoint.
- `modal.gpu.A10G`, `modal.gpu.L40S`, `modal.gpu.H100` configurable per model.
- `container_idle_timeout=300` for warm pool; `keep_warm=N` declared per function.
- Cold-start probe endpoint always deploys to ensure Modal reports healthy.

## RunPod adapter

- RunPod serverless endpoint with matching payload; `runpodctl` or REST API for control-plane operations.
- Feature parity with Modal where supported; degrades gracefully when it isn't.

## Test plan

- Real Modal + RunPod deployments behind CI secrets.
- Scenarios:
  - Cold start: first request against an empty pool completes within cold-boot budget; subsequent requests hit warm pool.
  - Burst: 20 parallel requests; dispatcher scales up to 10 instances; latency stays within 2× baseline.
  - Health: kill an instance (via provider API); dispatcher detects within 20s; requests reroute.
  - Failover: disable Modal (via feature flag); verify RunPod picks up; latency bump logged but no user-facing errors.
  - LoRA affinity: request with a specific LoRA lands twice on the same instance (no reload cost).

## Deliverables

- `packages/gpu-dispatcher/src/{server.ts, pool.ts, router.ts, adapters/{modal.ts, runpod.ts}, health.ts, types.ts}`.
- `packages/gpu-dispatcher/modal/app.py`.
- `packages/gpu-dispatcher/README.md` with cost-tuning guide.

## Acceptance criteria

- Warm-pool steady-state p95 latency within 20% of bare model service baseline.
- Failover works end-to-end.
- Cost per scene (50% cache hit workload, reference apps) within a documented budget target.

## Non-goals

- No training workflows.
- No on-prem GPU orchestration (future; k8s-based).
- No model checkpoint management (delegated to each model server).
