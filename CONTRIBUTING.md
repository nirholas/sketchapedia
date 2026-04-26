# Contributing to Sketchapedia

Thank you for contributing. This repo is a pnpm + Turborepo monorepo under strict TypeScript. Every change must keep `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` green.

## Local setup

```bash
# use the pinned Node version
nvm use

# install dependencies
pnpm install

# install git hooks
pnpm exec lefthook install
```

## Working inside one package

Every script is turbo-scoped. To work in, say, `@sketchapedia/client-core`:

```bash
# build just this package (and its workspace deps)
pnpm turbo run build --filter=@sketchapedia/client-core

# run its tests with coverage
pnpm --filter @sketchapedia/client-core test

# watch-rebuild while iterating
pnpm --filter @sketchapedia/client-core dev
```

Turbo's `--filter=...[HEAD]` restricts tasks to packages that changed (or depend on changed packages) since the last commit — useful on branches.

## Adding a new package

1. Create `packages/<name>/` following the structure of any existing package:
   - `package.json` — name `@sketchapedia/<name>`, version `0.0.0`, `type: module`, `exports` map with `types` + `import`.
   - `tsconfig.json` — extend `../../tsconfig.base.json`, set `rootDir: src`, `outDir: dist`. Add `references` entries for every `@sketchapedia/*` package you depend on.
   - `tsup.config.ts` — library packages only.
   - `vitest.config.ts` — resolve aliases for `@sketchapedia/*` workspace deps in tests.
   - `src/index.ts` + `src/index.test.ts` with at least one real assertion.
   - `README.md` describing the package's role and the prompt that populates it.
2. If your package depends on another `@sketchapedia/*` package, add it under `dependencies` with `workspace:*`.
3. Run `pnpm install` to refresh the lockfile and workspace graph.
4. `pnpm turbo run build test lint typecheck --filter=@sketchapedia/<name>` must all pass.

## Committing

- The `pre-commit` hook runs Biome (auto-fix) and typecheck on changed packages.
- The `pre-push` hook runs tests on packages changed since `origin/main`.
- Hooks enforce quality; do not bypass them (`--no-verify`) without a matching CI fix.

## Versioning and releases

We use [Changesets](https://github.com/changesets/changesets) for versioning.

```bash
# after you've made changes to one or more @sketchapedia/* packages
pnpm changeset

# select the packages, pick bump level (patch/minor/major), write a summary
```

The changeset file lands in `.changeset/*.md`. CI will open a "Version Packages" PR that bumps versions across the dependency graph — so bumping a new type in `@sketchapedia/protocol` cascades a bump to `@sketchapedia/client-core`, etc.

When the version PR merges to `main`, CI publishes to npm.

## Quality bar (non-negotiable)

- No mocks, no stubs, no `TODO:`/`FIXME:` committed.
- Strict TypeScript: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `useUnknownInCatchVariables` all enabled.
- No `any`. Biome will reject it.
- Tests must exercise behavior — at least one meaningful assertion per exported symbol.
- Every public primitive must have a keyboard + screen-reader story (client packages) or structured logging + OpenTelemetry traces (server packages).

See [`prompts/README.md`](./prompts/README.md) for the full quality charter.
