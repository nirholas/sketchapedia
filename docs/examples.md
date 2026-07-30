# sketchapedia examples

Sketchapedia — Model-as-a-Renderer SDK: generative pixel layer with an invisible semantic DOM overlay.

## Example 1

```text
sketchapedia/
├── apps/                       # docs site + reference example apps
│   ├── docs/                   # prompt 28
│   ├── examples-eiffel/        # prompt 29
│   ├── examples-ice-water/     # prompt 30
│   ├── examples-times-square/  # prompt 31
│   └── examples-dashboard/     # prompt 32
├── packages/                   # 17 SDK, server, model, infra packages
│   ├── protocol/               # prompt 02 — shared types
│   ├── cache-keys/             # prompt 03 — content-addressed keys
│   ├── client-core/            # prompts 04–09, 11–13
│   ├── client-react/           # prompt 10
│   ├── server-gateway/         # prompt 14
│   ├── server-orchestrator/    # prompt 15
│   ├── model-{llm,image,video,vision}/
│   ├── cache-server/           # prompt 20
│   ├── edge-worker/            # prompt 21
│   ├── gpu-dispatcher/         # prompt 22
│   ├── devtools/               # prompt 23
│   ├── observability/          # prompt 24
│   ├── security/               # prompt 26
│   └── cli/                    # prompt 27
├── tests-e2e/                  # Playwright, prompt 25
├── infra/                      # Pulumi IaC, prompt 33
├── benchmarks/                 # perf / cost harness, prompt 34
├── prompts/                    # canonical build-plan specs
└── .github/workflows/          # CI matrix (Linux + macOS)
```

## Example 2

```bash
# use pinned Node
nvm use

# install workspace deps
pnpm install

# build every package (tsup → dual ESM + .d.ts)
pnpm build

# run unit tests with coverage
pnpm test

# lint + format with Biome
pnpm lint

# strict typecheck across the composite project graph
pnpm typecheck
```


Every snippet above is taken from the [repository documentation](https://github.com/nirholas/sketchapedia#readme).
