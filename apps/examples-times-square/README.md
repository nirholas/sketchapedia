# @sketchapedia/examples-times-square

Reference app: Evolution of Times Square — isometric scrubbable architectural timeline.

**Populated by prompt 31.** This package is part of the Sketchapedia [monorepo](../../README.md); the canonical build spec lives at [`prompts/31-*.md`](../../prompts/).

## Usage

This package is currently the prompt-01 scaffold stub. It exports a single canonical constant so that declaration emission, composite project references, and smoke tests can be verified before the real module lands.

```ts
import { examplesTimesSquarePackageName } from '@sketchapedia/examples-times-square';
```

## Scripts

- `pnpm build` — compile with tsup / vite (dual ESM + .d.ts for libraries).
- `pnpm test` — Vitest with v8 coverage (thresholds: 80% statements/branches/functions/lines).
- `pnpm lint` — Biome.
- `pnpm typecheck` — `tsc --noEmit`.

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for workflow details.
