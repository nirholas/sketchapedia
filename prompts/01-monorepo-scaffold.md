# 01 — Monorepo Scaffold

## Project context

Sketchapedia is a Model-as-a-Renderer SDK. Generative models produce UI imagery; an invisible DOM overlay carries input, state, and accessibility. The repo must hold a framework-agnostic client SDK, a React binding layer, a Bun-based server, model runtimes, edge workers, examples, docs, and infrastructure — all sharing strict TypeScript types.

**Quality bar**: production-grade from day one. No placeholder packages, no empty `index.ts` files committed as scaffolding. Every package created here must be *buildable*, *testable*, *lintable*, and publishable. See `prompts/README.md` and `prompts/00-vision.md` for full context.

## Your task

Establish the monorepo. Produce the durable skeleton that every other prompt will consume. **You are the only prompt the others transitively depend on — get this right.**

## Technical requirements

- Package manager: **pnpm** with workspaces. Pin pnpm via `packageManager` field and `.npmrc`.
- Task orchestrator: **Turborepo** (`turbo.json` with `build`, `test`, `lint`, `typecheck`, `dev` pipelines and correct `dependsOn` graph).
- Language: **TypeScript 5.6+**, strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` + `useUnknownInCatchVariables`. Shared `tsconfig.base.json` at root; packages extend it.
- Module system: ESM only (`"type": "module"`). Use `exports` maps with `types`, `import` conditions. No CJS builds.
- Builder: **tsup** for library packages (emits dual ESM + `.d.ts`). Apps use **Vite** (frontend) and **Bun** (backend) directly.
- Linter/formatter: **Biome** configured with workspace-wide settings. `lint` and `format` scripts. No ESLint, no Prettier.
- Unit tests: **Vitest** with `@vitest/coverage-v8`. Coverage thresholds enforced per package (start at 80 % statements/lines/branches).
- Git hooks: **lefthook** (pre-commit runs lint + typecheck on changed packages; pre-push runs tests).
- Node version: `.nvmrc` pinned to 20 LTS; Bun version pinned in `package.json` engines (`>=1.1`).
- CI: `.github/workflows/ci.yml` runs install → lint → typecheck → build → test on pnpm + Bun matrix; caches turbo and pnpm store.
- Changesets: `@changesets/cli` for versioning and release notes.

## Packages to create (empty but functional — each must compile, lint, and pass a smoke test)

Under `packages/`:

- `protocol` — shared types (populated by prompt 02).
- `cache-keys` — content-addressed key derivation (populated by prompt 03).
- `client-core` — framework-agnostic SDK.
- `client-react` — React bindings.
- `server-gateway` — WebSocket entry (Bun).
- `server-orchestrator` — generation pipeline.
- `model-llm` — layout generator.
- `model-image` — image model client.
- `model-video` — video model client.
- `model-vision` — hitmap correction.
- `cache-server` — Redis + S3.
- `edge-worker` — Cloudflare Worker (uses `@cloudflare/workers-types`, `wrangler` dev).
- `gpu-dispatcher` — Modal/RunPod adapter.
- `devtools` — inspector package.
- `observability` — OTel helpers.
- `security` — auth / prompt-injection defenses.
- `cli` — `sketchapedia` command.

Under `apps/`:

- `docs`, `examples-eiffel`, `examples-ice-water`, `examples-times-square`, `examples-dashboard`.

Root-level directories:

- `tests-e2e/`, `infra/`, `benchmarks/`, `.github/`, `.changeset/`.

## Package boilerplate contract

Every `packages/*` package must include:

- `package.json` with `name: @sketchapedia/<name>`, `version: 0.0.0`, scoped public access, correct `exports`/`types`/`main`/`module`.
- `tsconfig.json` extending `../../tsconfig.base.json`, with `composite: true`, `rootDir: src`, `outDir: dist`.
- `tsup.config.ts` (library packages).
- `vitest.config.ts` with workspace-aware alias resolution.
- `src/index.ts` with a single exported symbol (to verify type declarations emit).
- `src/index.test.ts` with at least one real assertion.
- `README.md` describing the package's role in Sketchapedia and the prompt that populates it.
- `CHANGELOG.md` (created by changesets on first release).

## Shared configuration files at root

- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- `biome.json`
- `.gitignore` (covers `dist`, `.turbo`, `node_modules`, coverage, build artifacts, env files, but explicitly **not** `pnpm-lock.yaml`)
- `.nvmrc`
- `.editorconfig`
- `package.json` (root — `private: true`, holds dev-only dependencies, scripts delegate to turbo)
- `lefthook.yml`
- `LICENSE` (Apache-2.0)
- `README.md` (repo-level overview linking to `prompts/README.md`)

## Implementation mandates

- Every script at root (`pnpm <script>`) must work end-to-end: `pnpm install && pnpm build && pnpm test && pnpm lint && pnpm typecheck` succeeds on a clean clone.
- `pnpm -r build` must produce `dist/` in every library package with both `.js` and `.d.ts` files. Verify by inspecting `packages/client-core/dist/index.d.ts` after build.
- Biome configuration must include rules that reject `any`, enforce `const` over `let` where possible, and format on commit via lefthook.
- CI matrix runs on both Linux and macOS.
- Changesets configured so that releasing `@sketchapedia/client-core` also bumps `@sketchapedia/protocol` when its types change.

## Deliverables

Files listed above, all committed, all passing. A `CONTRIBUTING.md` at root describing how to run one package's tests, how to bump versions, how to add a new package.

## Acceptance criteria

- `pnpm install` on a fresh checkout succeeds in under 60 seconds with warm cache.
- `pnpm turbo run build --filter=@sketchapedia/client-core` completes and produces valid `dist/`.
- `pnpm test` runs at least one assertion per package; coverage report is emitted.
- `pnpm lint` passes with zero errors and zero warnings.
- A type error introduced in `packages/protocol/src/index.ts` breaks `packages/client-core`'s typecheck (proves composite project references wired correctly).
- CI green on a PR touching a single package (must correctly scope turbo tasks).

## Non-goals

- Do not write business logic in any package except the trivial smoke-test export. Populating each package is the job of its dedicated prompt.
- Do not configure deployment yet — that's prompt 33.
- Do not add framework runtimes inside `client-core` — it must remain framework-agnostic.
