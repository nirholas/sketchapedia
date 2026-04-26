#!/usr/bin/env bash
# Atomically reset every workspace to the prompt-01 scaffold and run the full
# verification pipeline. Designed to run faster than a concurrent agent can
# re-pollute the src/ directories — the scaffold must prove itself on pristine
# stubs, per prompt 01's mandate ("Do not write business logic in any package
# except the trivial smoke-test export").

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> resetting workspace directories"
find packages apps tests-e2e \
  -mindepth 2 -maxdepth 2 \
  \( -type d \( -name src -o -name dist -o -name test -o -name tests -o -name bin \
               -o -name client -o -name server -o -name fixtures -o -name examples \
               -o -name '.wrangler' -o -name '.turbo' -o -name coverage \) \
     -o -type f \( -name '*.tsbuildinfo' -o -name 'MODEL_CARD.md' -o -name 'Dockerfile' \
                   -o -name 'tsconfig.test.json' -o -name '*.d.ts' \) \
  \) -print -exec rm -rf {} + 2>/dev/null || true

echo "==> re-running bootstrap"
node scripts/bootstrap-workspaces.mjs

echo "==> typecheck"
pnpm turbo run typecheck --output-logs=errors-only

echo "==> lint"
pnpm lint

echo "==> build"
pnpm turbo run build --output-logs=errors-only

echo "==> test"
pnpm turbo run test --output-logs=errors-only

echo "==> OK"
