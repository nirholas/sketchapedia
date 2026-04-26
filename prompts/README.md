# Sketchapedia — Prompt Index

This directory contains self-contained prompt files that, together, drive the Sketchapedia SDK to production completion. Each `.md` file is a standalone brief — an autonomous agent should be able to execute any single file without reading any other prompt, after the foundation phase (01–03) is complete.

## Project vision (short)

Sketchapedia is a **Model-as-a-Renderer (MaaR)** SDK. Instead of a browser painting DOM, a generative pipeline produces interface imagery; an invisible DOM overlay carries the logical layer (input, state, accessibility).

- **Generative layer**: LLM → layout spec + hitmap JSON + image prompt. Image model (FLUX/SDXL + ControlNet) → keyframe. Video model (LTX-Video) → short transition clip between keyframes. Content-addressed, cached.
- **Logical layer**: Canvas renders pixels. Invisible DOM mirrors the hitmap with real `<input>`, `<button>`, ARIA roles — this is what users actually click, type into, tab through.
- **Cost model**: cache-first. Steady-state is CDN serving. Model calls only for novel transitions.

## Phase map

| Phase | Prompts | Purpose |
|-------|---------|---------|
| 1. Foundation | 01–03 | Monorepo, protocol types, cache-key spec. **Must run first.** Everything downstream depends only on the durable artifacts these produce. |
| 2. Client SDK | 04–13 | Canvas renderer, hitmap, DOM overlay, scene graph, cache, transport, React bindings, effects, scrubbable media, accessibility. **All parallelizable.** |
| 3. Backend | 14–22 | WS gateway, orchestrator, LLM + image + video runtimes, hitmap vision correction, server cache, CDN edge, GPU dispatcher. **All parallelizable.** |
| 4. Quality / integration | 23–28 | Dev tools, observability, E2E tests, security, CLI, docs site. |
| 5. Reference apps | 29–32 | Eiffel guide, ice/water, Times Square timeline, dashboard (reproduces the inspiration videos). |
| 6. Infra / release | 33–34 | IaC + deployment, benchmarks. |

## How to execute

After cloning, run prompts 01, 02, 03 **sequentially** in that order. Then launch prompts 04–34 in any order, in parallel or serially. Each file declares its own dependencies, interfaces consumed/exposed, acceptance criteria, and non-goals.

## Quality bar (applies to every prompt)

- **No mocks. No stubs. No TODOs left behind.** Real implementations against real services/models. If a dependency isn't available, provision it — don't fake it.
- **Production-grade code only.** Proper error paths, structured logging, observability hooks, types strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), tests exercise behavior not just happy paths.
- **No "simplified for demo" shortcuts.** Every module ships ready to deploy.
- **Security first.** CSP, input validation, prompt-injection defenses, tenant isolation where relevant.
- **Accessibility first.** Every user-visible primitive has a keyboard and screen-reader story.

## Repo layout (target state after 01)

```
sketchapedia/
├── apps/
│   ├── docs/                  # docs site (prompt 28)
│   ├── examples-eiffel/       # prompt 29
│   ├── examples-ice-water/    # prompt 30
│   ├── examples-times-square/ # prompt 31
│   └── examples-dashboard/    # prompt 32
├── packages/
│   ├── protocol/              # prompt 02 — shared types, message schemas
│   ├── cache-keys/            # prompt 03 — content-addressed key derivation
│   ├── client-core/           # prompts 04–09, 11–13 — framework-agnostic SDK
│   ├── client-react/          # prompt 10 — React 19 bindings
│   ├── server-gateway/        # prompt 14 — WS entry
│   ├── server-orchestrator/   # prompt 15 — scene generation pipeline
│   ├── model-llm/             # prompt 16 — layout generator
│   ├── model-image/           # prompt 17 — image runtime
│   ├── model-video/           # prompt 18 — video runtime
│   ├── model-vision/          # prompt 19 — hitmap correction
│   ├── cache-server/          # prompt 20 — Redis + S3
│   ├── edge-worker/           # prompt 21 — Cloudflare Worker
│   ├── gpu-dispatcher/        # prompt 22 — Modal/RunPod client
│   ├── devtools/              # prompt 23
│   ├── observability/         # prompt 24
│   ├── security/              # prompt 26
│   └── cli/                   # prompt 27
├── tests-e2e/                 # prompt 25
├── infra/                     # prompt 33
├── benchmarks/                # prompt 34
└── pnpm-workspace.yaml
```

## Technology charter

- **Language**: TypeScript 5.6+, strict. Shared across client and server.
- **Client runtime**: modern evergreen browsers. Offscreen canvas, WebCodecs, WebGL2, WebGPU where available.
- **Server runtime**: Bun (Node 20+ compatible).
- **Monorepo**: pnpm workspaces + Turborepo.
- **Lint/format**: Biome.
- **Unit tests**: Vitest.
- **E2E tests**: Playwright.
- **HTTP/WS server**: Hono on Bun.
- **State machine**: XState v5.
- **LLM**: Anthropic Claude (primary) via structured tool use; pluggable.
- **Image model**: FLUX.1-dev with IP-Adapter + ControlNet reference conditioning.
- **Video model**: LTX-Video.
- **Vision (grounding)**: Florence-2 or Grounding DINO.
- **GPU runtime**: Modal (primary), RunPod adapter.
- **Edge / CDN**: Cloudflare Workers + R2.
- **Cache server**: Redis + S3/R2-compatible object storage.
- **Observability**: OpenTelemetry (traces, metrics, logs).
- **IaC**: Pulumi (TypeScript) — single-language parity with the rest of the stack.

Every prompt assumes this charter. Deviate only with strong justification in that module's README.
