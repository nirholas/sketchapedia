# 34 — Benchmarks & Performance Harness

## Project context

Sketchapedia's viability rests on latency and cost budgets. Scene commits must be fast; cache hit rates must be high; GPU amortization must work. Without a benchmarking harness the project has no proof of meeting its claims. See `prompts/00-vision.md`.

## Your task

Implement `benchmarks/` — a suite that measures client, server, and model performance, tracks regressions over time, and publishes dashboards. Runs on a schedule plus on-demand via the CLI (prompt 27) and CI.

## Technical requirements

- **Client benchmarks** (Playwright + Puppeteer-level tracing):
  - Scene commit latency by source (cache, memory, generated).
  - Hitmap lookup p99.
  - Overlay reconcile time.
  - Frame rate during scrub (prompt 12).
  - Transition clip decode latency.
  - Idle memory baseline; steady-state growth across 200 scenes.
- **Server benchmarks** (k6):
  - Gateway WS throughput (connections/sec, intents/sec, p95 latency).
  - Orchestrator end-to-end (cache-hit vs. cache-miss).
  - Cache server PUT/GET throughput.
- **Model benchmarks**:
  - Image model: steps/sec at 1920×1080, bf16, A10G / L40S / H100.
  - Video model: per-clip latency + SSIM quality.
  - Vision correction: IoU + latency.
- **Cost benchmark**: 1000-scene synthetic workload with realistic cache-hit mix; measures $ per 1000 scenes.
- **Quality benchmark**: 50 scene fixtures with human-labeled ground-truth hitmaps; automated IoU + style-consistency score.

## Implementation mandates

- All benchmarks runnable locally and in CI.
- Results normalized and published to a time-series store (Prometheus / Grafana) with historical tracking.
- Threshold gates in CI: regressions > 10% on core metrics fail the PR.
- Benchmark code versioned; changes require approval to prevent silent metric drift.
- Deterministic seeds where possible.
- Each benchmark outputs both JSON (for storage) and Markdown (for PR comments).

## Reports

- `benchmarks/reports/latest.md` — human-readable summary with sparklines.
- `benchmarks/reports/history.json` — machine-readable time-series.
- Grafana dashboard: `benchmarks` folder with per-metric panels, YoY / WoW comparison.
- Weekly digest automation posts to a configurable webhook.

## Test plan

- Benchmarks themselves have smoke tests: run with a tiny fixture to validate they instrument correctly without spending real model budget.
- A deliberately regressed change (e.g. an unnecessary `JSON.stringify` in the hot path) must cause the regression gate to trigger.

## Deliverables

- `benchmarks/src/{client/*.ts, server/*.k6.js, models/*.py, cost.ts, quality.ts}`.
- `benchmarks/fixtures/` with labeled ground-truth data.
- CI workflow `.github/workflows/bench.yml`.
- Grafana dashboards under `observability/dashboards/benchmarks/`.
- `benchmarks/README.md`.

## Acceptance criteria

- All benchmarks run end-to-end against a live environment.
- Historical data collected for at least 7 days on staging.
- Regression gate triggers on a canary PR.
- Cost benchmark produces a realistic $/1000 scenes figure.

## Non-goals

- No public benchmark leaderboard.
- No chaos engineering (future).
