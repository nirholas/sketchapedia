# Sketchapedia

<!-- three.ws:badges -->
[![GitHub stars](https://img.shields.io/github/stars/nirholas/sketchapedia?style=flat&logo=github)](https://github.com/nirholas/sketchapedia/stargazers) [![Last commit](https://img.shields.io/github/last-commit/nirholas/sketchapedia?style=flat)](https://github.com/nirholas/sketchapedia/commits) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat)](https://github.com/nirholas/sketchapedia/pulls) [![AI agent friendly](https://img.shields.io/badge/AI%20agents-AGENTS.md%20%2B%20llms.txt-6d5dfc?style=flat)](https://github.com/nirholas/sketchapedia/blob/HEAD/AGENTS.md)
<!-- /three.ws:badges -->


**A hybrid generative–logical SDK for building fluid, non-rectangular, AI-rendered user interfaces on the web.**

Sketchapedia is *Model-as-a-Renderer* (MaaR) — replacing the DOM/CSS/JS rendering pipeline with a generative image/video model that paints the UI as pixels, while a thin invisible DOM overlay preserves input, state, accessibility, and text fidelity.

## The vision in one sentence

Stop shipping *instructions for how to draw a UI* (HTML, CSS, layout trees). Ship *intent*, and let a model render the pixels that best express that intent for this user, this viewport, this moment.

## Architecture

Two cooperating layers:

1. **Generative pixel layer.** An LLM emits a layout + hitmap; an image model (FLUX + ControlNet) renders keyframes; a video model (LTX-Video) renders short transitions. Drawn to `<canvas>`. Content-addressed, CDN-cached.
2. **Invisible logical layer.** Real `<input>`, `<button>`, ARIA-labeled elements positioned from the hitmap. Hit-testing, form input, IME, password managers, screen readers, keyboard nav — all handled by the platform instead of simulated.

GPU cost only burns on novel state transitions; steady state is CDN-served.

See [`prompts/00-vision.md`](./prompts/00-vision.md) for the full architectural brief and [`prompts/README.md`](./prompts/README.md) for the staged build plan across 34 prompts.

## Repository layout

```
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

## Getting started

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

Requirements: Node 20 LTS (see `.nvmrc`), pnpm 10 (pinned via `packageManager`), Bun ≥ 1.1 for the server packages. Git hooks install on `pnpm install` via lefthook.

## Legacy pre-monorepo sketch

The pre-monorepo prototype lives in the repo root (`src/`, `demo/`, `index.html`, `legacy.html`, `sketchapedia/`). It's the original JS sketch of the logical-overlay idea and the flipbook/canvid/stack frame-streaming ancestors. It is **informative but not canonical** — the production SDK is built under `packages/` and `apps/` per the prompts in [`prompts/`](./prompts/).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Every change must keep `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` green. Version bumps use [Changesets](./.changeset/).

## License

All rights reserved. See [LICENSE](LICENSE).

## Documentation

Full documentation site: **https://nirholas.github.io/sketchapedia/**

- [Getting started](docs/getting-started.md) covers install and first run.
- [Examples](docs/examples.md) has copy-paste snippets.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nirholas/sketchapedia&type=Date)](https://www.star-history.com/#nirholas/sketchapedia&Date)

<!-- three.ws:growth -->
## Support the project

If sketchapedia saves you time, **[star it on GitHub](https://github.com/nirholas/sketchapedia)**. Stars are how other developers and AI agents find the repositories worth trusting, and they cost you one click.

Know someone who would use it? [Post on X](https://twitter.com/intent/tweet?text=sketchapedia%3A%20Experimental%20TypeScript%20SDK%20that%20renders%20web%20UIs%20as%20AI-generated%20pixels%20with%20an%20invisible&url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fsketchapedia) · [Share on Bluesky](https://bsky.app/intent/compose?text=sketchapedia%3A%20Experimental%20TypeScript%20SDK%20that%20renders%20web%20UIs%20as%20AI-generated%20pixels%20with%20an%20invisible%20https%3A%2F%2Fgithub.com%2Fnirholas%2Fsketchapedia) · [Share on LinkedIn](https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fsketchapedia) · [Submit to Hacker News](https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fgithub.com%2Fnirholas%2Fsketchapedia&t=sketchapedia%3A%20Experimental%20TypeScript%20SDK%20that%20renders%20web%20UIs%20as%20AI-generated%20pixels%20with%20an%20invisible) · [Share on Reddit](https://www.reddit.com/submit?url=https%3A%2F%2Fgithub.com%2Fnirholas%2Fsketchapedia&title=sketchapedia%3A%20Experimental%20TypeScript%20SDK%20that%20renders%20web%20UIs%20as%20AI-generated%20pixels%20with%20an%20invisible)

## Built for AI agents too

Coding agents and LLM tooling can read this repo directly: [AGENTS.md](./AGENTS.md), [llms.txt](./llms.txt), [llms-full.txt](./llms-full.txt). Point an agent at `https://github.com/nirholas/sketchapedia` and it has the context it needs.

## More from the same author

- [All repositories by nirholas](https://github.com/nirholas/nirholas#readme): the full catalog, grouped by topic
- [three.ws](https://three.ws): the platform for 3D AI agents with Solana wallets, a skill marketplace and x402 payments
- Questions or ideas: [open an issue](https://github.com/nirholas/sketchapedia/issues) or [start a discussion](https://github.com/nirholas/sketchapedia/discussions)

## Contributors

[![Contributors](https://contrib.rocks/image?repo=nirholas/sketchapedia)](https://github.com/nirholas/sketchapedia/graphs/contributors)

<!-- /three.ws:growth -->
