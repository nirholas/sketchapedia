# @sketchapedia/model-vision

Hitmap-to-pixel correction via Florence-2 / Grounding DINO.

Implemented in prompt 19. This package owns the **vision grounding service**
that takes a rendered keyframe + an LLM-drafted hitmap and returns a
corrected hitmap whose item coordinates land on actual pixels. See
[`MODEL_CARD.md`](./MODEL_CARD.md) for the full model spec and
[`prompts/19-*.md`](../../prompts/) for the build spec.

## Layout

```
packages/model-vision/
├── server/                   # Python FastAPI service (Florence-2 + Grounding DINO)
│   ├── src/model_vision/     # FastAPI app, correction algorithm, adapters
│   ├── tests/                # Pure-Python tests; no GPU needed
│   ├── pyproject.toml        # PyPI deps + dev tooling
│   └── Dockerfile            # CUDA 12.1 runtime image
├── src/                      # TypeScript client for the orchestrator
│   ├── client.ts             # `VisionClient.ground` / `groundStream`
│   ├── sse.ts                # POST + AbortSignal SSE decoder
│   ├── errors.ts             # Structured error classes
│   └── types.ts              # Wire types (Hitmap, GroundRequest, …)
├── fixtures/                 # 20 labeled keyframes for IoU evaluation
├── scripts/evaluate.py       # IoU benchmark vs. fixtures (≥ 0.75 to pass)
└── MODEL_CARD.md             # Model details, telemetry, safety
```

The TypeScript client is intentionally pure-protocol and does **not** load
any models — it speaks HTTP/SSE to the Python service. The orchestrator
(prompt 15) wires the two together.

## TypeScript usage

```ts
import { VisionClient } from '@sketchapedia/model-vision';

const client = new VisionClient({
  baseUrl: process.env.MODEL_VISION_URL!,    // http://model-vision:8019
  defaultDeadlineMs: 500,
});

const { hitmap, diagnostics } = await client.ground({
  keyframeUrl: scene.keyframeUrl,
  hitmapDraft: scene.hitmapDraft,
  mode: 'auto',
});
```

The streaming variant emits `started`, `loading`, `completed`, `error`:

```ts
for await (const ev of client.groundStream(req)) {
  if (ev.type === 'completed') return ev.response;
}
```

## Running the Python service

```bash
cd packages/model-vision/server
pip install -e .[dev]
python -m model_vision.main          # → http://0.0.0.0:8019
```

Or via Docker:

```bash
docker build -t sketchapedia/model-vision packages/model-vision/server
docker run --gpus all -p 8019:8019 sketchapedia/model-vision
```

Endpoints:

| Path | Method | Purpose |
| --- | --- | --- |
| `/ground` | POST | One-shot correction; returns hitmap + diagnostics |
| `/ground/stream` | POST | Same payload; SSE progress events |
| `/healthz` | GET | Liveness (always 200) |
| `/readyz` | GET | 503 until models warm; 200 once loaded |
| `/metrics` | GET | Prometheus text format |

## Tests

* **Python (no GPU):** `cd server && pytest` — exercises the geometry, matching,
  correction, schema, and FastAPI-route logic with deterministic in-memory
  detector implementations.
* **TypeScript:** `pnpm test` — Vitest covers the SSE decoder and `VisionClient`.
* **Real models (GPU CI):** `python scripts/evaluate.py --mode local` runs the
  full pipeline on the 20 fixtures and asserts mean IoU ≥ 0.75.
* **Live service:** `python scripts/evaluate.py --mode remote --url http://...`.

## Acceptance bar

| Metric | Target |
| --- | --- |
| Mean IoU on fixtures | ≥ 0.75 |
| p95 latency on A10G | ≤ 500 ms |
| Escalation path covered | yes |
| Corrected boxes overlap ≤ 10% | yes |

## Scripts

- `pnpm build` — tsup ESM + .d.ts.
- `pnpm test` — Vitest with v8 coverage (thresholds: 80%).
- `pnpm lint` / `pnpm typecheck` — Biome / `tsc --noEmit`.

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for workflow details.
