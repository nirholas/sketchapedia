# @sketchapedia/examples-dashboard

Reference app: Project Dashboard — comic-book-style software engineering dashboard with schema diagrams.

**Populated by prompt 32.** This package is part of the Sketchapedia [monorepo](../../README.md); the canonical build spec lives at [`prompts/32-*.md`](../../prompts/).

## Usage

This package is currently the prompt-01 scaffold stub. It exports a single canonical constant so that declaration emission, composite project references, and smoke tests can be verified before the real module lands.

```ts
import { examplesDashboardPackageName } from '@sketchapedia/examples-dashboard';
```

## Scripts

- `pnpm build` — compile with tsup / vite (dual ESM + .d.ts for libraries).
- `pnpm test` — Vitest with v8 coverage (thresholds: 80% statements/branches/functions/lines).
- `pnpm lint` — Biome.
- `pnpm typecheck` — `tsc --noEmit`.

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for workflow details.
