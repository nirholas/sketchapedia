# 27 — CLI (`sketchapedia`)

## Project context

Developers need a simple, discoverable command-line surface: scaffold a new app, run a local dev stack (gateway + orchestrator + MinIO + Redis + a stubbed-but-real model endpoint for low-cost iteration), author scenes interactively, push a tenant style guide, inspect cache, replay a recorded session. See `prompts/00-vision.md`.

## Your task

Implement `packages/cli/` — the `sketchapedia` command. Distributed via `npm install -g @sketchapedia/cli`. Internally organized with subcommands and robust help.

## Technical requirements

- Runtime: Bun (binary + `bunx` invocation); installable as `npx @sketchapedia/cli` for Node users. Ship a pre-compiled single-binary via `bun build --compile` for each OS/arch.
- CLI framework: **@clack/prompts** for interactive prompts, **citty** or **commander** for command parsing; pick one consistently.
- Config: reads `sketchapedia.config.ts` in the consumer's project root (typed, validated).
- Secrets via env; also supports `sketchapedia login` to store an OAuth token in the OS keychain (`@napi-rs/keyring`).

## Subcommands

- `sketchapedia init [dir]` — scaffolds a new app: Next.js or Vite template; includes `<SketchapediaProvider>` boilerplate, a starter scene, sensible defaults.
- `sketchapedia dev` — runs a local dev stack via Docker Compose (delegates to the `tests-e2e/stack/` compose file) and spawns the client-side app with live reload.
- `sketchapedia login` / `logout` — OAuth flow to the Sketchapedia account system (placeholder for managed offering; also supports self-hosted by pointing at a custom auth URL).
- `sketchapedia scene author` — interactive authoring: enter an intent + initial state; prints the rendered scene URL and opens the inspector.
- `sketchapedia scene list --tenant=...` — paginates scene metadata.
- `sketchapedia scene pin <id> [--ttl=...]` — pins a scene in server cache.
- `sketchapedia scene export <id> --out=./scene.json` — exports scene + artifacts for diffing/reproducibility.
- `sketchapedia replay <file.skrec>` — replays a recorded session from the dev tools (prompt 23).
- `sketchapedia cache stats` — summary for a tenant.
- `sketchapedia style push ./style.md --tenant=...` — uploads a tenant style guide (consumed by prompt 16).
- `sketchapedia benchmark run` — triggers benchmarks (prompt 34).
- `sketchapedia doctor` — environment diagnostics (Node/Bun versions, Docker, Wrangler, Modal auth, GPU CUDA availability if applicable).
- `sketchapedia upgrade` — self-update.

## Implementation mandates

- Structured output: every command supports `--json` for scripting.
- Progress indicators via spinners; graceful Ctrl-C.
- Telemetry opt-in only; never collected without consent; consent prompt on first run.
- Error messages with actionable suggestions ("run `sketchapedia doctor` to diagnose").
- Commands are idempotent where possible.
- `init` templates tested in CI — cold scaffold + build + dev-server boot.

## Test plan

- Snapshot tests on command output and help text.
- `init`: scaffold to tmp dir; `pnpm install`; `pnpm dev` boots; Playwright-driven smoke test loads the scaffolded page.
- `dev`: starts Docker stack; pings healthz; stops.
- `scene author`: launches interactive prompt; submits canned responses via `--non-interactive` mode.
- `doctor`: runs on macOS, Linux, Windows CI matrix; reports expected statuses.

## Deliverables

- `packages/cli/src/{cli.ts, commands/*.ts, templates/{next, vite}/, doctor.ts, config.ts}`.
- Pre-built single-binary artifacts published via GitHub Releases.
- `packages/cli/README.md`.

## Acceptance criteria

- `init` + `dev` get a user from zero to a scene in < 5 minutes on a fresh machine.
- `--json` output valid JSON for every command.
- Cross-platform tests green.

## Non-goals

- No cloud-hosting provisioning commands (that lives in prompt 33 / IaC).
- No model fine-tuning workflows.
