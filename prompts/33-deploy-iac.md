# 33 — Infrastructure as Code & Deployment

## Project context

Sketchapedia's backend spans HTTP services, WebSocket gateways, Redis, S3/R2 buckets, Cloudflare Workers, GPU clusters on Modal/RunPod, observability infrastructure. Shipping this reproducibly requires IaC. See `prompts/00-vision.md`.

## Your task

Implement `infra/` — a **Pulumi** project in TypeScript (single-language parity with the rest of the stack) defining every production resource. Includes separate stacks for `dev`, `staging`, `prod`, and per-demo tenant stacks.

## Technical requirements

- Pulumi v3 with TypeScript.
- Providers:
  - **Cloudflare** (pages, workers, R2 buckets, DNS, zones, worker routes).
  - **AWS** (ECS/Fargate or EKS for gateway + orchestrator + cache + dispatcher, Redis via ElastiCache, Secrets Manager, Route 53 for DNS if using AWS).
  - **Modal** (via HTTP API wrapper — apps deployed via `modal deploy` from CI; Pulumi tracks config).
- Container images built + pushed via the CI workflow prior to `pulumi up`.
- Secrets stored via **Pulumi ESC** (Environments & Secrets) + provider-native secret managers.
- DNS: `sketchapedia.com`, `edge.sketchapedia.com`, `api.sketchapedia.com`, `docs.sketchapedia.com`, `observability.sketchapedia.com`.
- TLS: ACM for AWS origins, Cloudflare-managed for edge.
- Mandatory: network ACLs / security groups tight; no public ingress except via CDN or load balancer.

## Stacks

- `dev` — single small instance per service; Modal dev workspace.
- `staging` — production-equivalent topology at lower scale.
- `prod` — full HPA, multi-AZ, reserved GPU capacity.

## Service topology (prod)

- Cloudflare R2 — artifact bucket.
- Cloudflare Workers — edge CDN worker (prompt 21).
- AWS ALB → ECS Fargate services:
  - `gateway` — 3 tasks min, HPA to 30 based on active WS connections.
  - `orchestrator` — 2 tasks min, HPA to 10.
  - `cache-server` — 2 tasks min.
  - `gpu-dispatcher` — 2 tasks min.
- ElastiCache Redis cluster (2 shards, multi-AZ).
- Observability stack (Grafana, Prometheus, Tempo, Loki) on a dedicated ECS service group or managed via **Grafana Cloud**.
- Modal workspace holding `image`, `video`, `vision` functions.

## CI/CD

- GitHub Actions:
  - `build-and-push.yml` — builds container images (gateway, orchestrator, cache, dispatcher, models), pushes to GHCR with digests.
  - `pulumi-preview.yml` — runs `pulumi preview` on PR; posts diff as a comment.
  - `pulumi-up-staging.yml` — deploys staging on merge to main.
  - `pulumi-up-prod.yml` — manual dispatch with required approver + change-log requirement.
  - `modal-deploy.yml` — `modal deploy` after successful staging smoke tests.
- Release automation via **changesets**: tag → publish npm packages → push container images → deploy.

## Implementation mandates

- Every resource tagged with `env`, `service`, `owner`, `managed-by: pulumi`.
- Disaster-recovery runbook in `infra/RUNBOOK.md`: credential rotation, RTO/RPO, failover, rollback.
- Cost budgets alarms per service.
- Zero-downtime deploys for stateless services; blue-green for gateway; rolling for orchestrator.
- Modal app deployments gated on staging smoke tests passing.
- Secret rotation every 90 days enforced via a scheduled job.
- All public endpoints behind WAF (Cloudflare WAF + AWS WAF on ALB).

## Test plan

- `pulumi preview` on CI proves plans are deterministic.
- Integration test: stand up the `dev` stack; run prompt 25's E2E suite against it; tear down.
- Disaster recovery drill: manually destroy a service; assert HPA restores; assert observability alerts fire correctly.
- Cost regression: weekly report compares Pulumi-declared resources against actual cloud spend.

## Deliverables

- `infra/Pulumi.yaml`, `infra/Pulumi.<stack>.yaml`.
- `infra/src/{network.ts, aws/*.ts, cloudflare/*.ts, modal/*.ts, observability/*.ts, secrets.ts}`.
- `infra/RUNBOOK.md`.
- GitHub Actions workflows referenced above.

## Acceptance criteria

- `dev` stack stands up cleanly from scratch in < 15 min.
- Deploy + rollback proven end to end.
- Cost budget alarms verified.

## Non-goals

- Kubernetes / Helm (future optional; ECS is sufficient for v1).
- Multi-region active-active (future; prod is multi-AZ single-region in v1).
