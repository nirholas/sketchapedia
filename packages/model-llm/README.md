# @sketchapedia/model-llm

Layout + hitmap generator — Anthropic Claude structured tool use, pluggable.

**Populated by prompt 16.** This package is part of the Sketchapedia [monorepo](../../README.md); the canonical build spec lives at [`prompts/16-*.md`](../../prompts/).

## Usage

This package is currently the prompt-01 scaffold stub. It exports a single canonical constant so that declaration emission, composite project references, and smoke tests can be verified before the real module lands.

```ts
import { modelLlmPackageName } from '@sketchapedia/model-llm';
```

## Scripts

- `pnpm build` — compile with tsup / vite (dual ESM + .d.ts for libraries).
- `pnpm test` — Vitest with v8 coverage (thresholds: 80% statements/branches/functions/lines).
- `pnpm lint` — Biome.
- `pnpm typecheck` — `tsc --noEmit`.

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for workflow details.
