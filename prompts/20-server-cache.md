# 20 — Server-Side Cache (Artifacts + Metadata)

## Project context

Sketchapedia's economics collapse without caching. The server-side cache is where every scene keyframe, transition clip, hitmap, and optional flow field lives — content-addressed, durable, and served via the CDN (prompt 21) when possible. Writes happen from the orchestrator (prompt 15); reads happen from the orchestrator (for cache lookups) and the edge worker (for CDN hydration). See `prompts/00-vision.md`.

## Your task

Implement `packages/cache-server/` — the TypeScript service that manages cache artifacts in **Redis** (metadata) and **S3-compatible object storage** (blobs; AWS S3, Cloudflare R2, or MinIO for local). Exposes a clean HTTP API + an internal TS client.

## Technical requirements

- Runtime: Bun + Hono.
- Redis: official client `ioredis`. Schema:
  - `scene:<sceneId>` → JSON with artifact URIs, hash, createdAt, tenantId, ttl.
  - `scene:<sceneId>:transitions` → SET of `transitionId`s.
  - `transition:<transitionId>` → JSON.
  - `artifact:<artifactId>` → JSON with `{ storageKey, mime, size, hash, codec? }`.
- Object storage: **AWS SDK v3** (`@aws-sdk/client-s3`) speaks to S3/R2/MinIO interchangeably.
- **Content-addressing**: object keys derived via `@sketchapedia/cache-keys` — not assigned by storage.
- **TTL**: default 30 days for scenes, 7 days for transitions. Pinned entries (declared by tenant) exempt.
- **GC**: background worker scans Redis metadata with expired TTL; deletes matching objects from S3 with the appropriate `If-Match` header on the ETag.
- **Multi-tenant namespacing**: all keys prefixed with `t:<tenantId>/` so tenants never share cache (per policy); cross-tenant reuse can be opt-in via a public style channel declared by the tenant admin.
- **Streaming**: all uploads stream from the orchestrator; no full-blob materialization in cache-server memory.
- **Consistency**: read-after-write is strong for metadata (Redis); artifacts eventually consistent on S3 but reads retry with small backoff (typical < 50ms on R2).

## HTTP API

- `PUT /scenes/:sceneId` — body is JSON scene + artifact blobs via multipart. Returns 200 with final URIs.
- `GET /scenes/:sceneId` — returns scene metadata.
- `HEAD /scenes/:sceneId` — existence check.
- `DELETE /scenes/:sceneId` (admin only).
- `PUT /transitions/:transitionId`, `GET /transitions/:transitionId`.
- `PUT /artifacts/:artifactId` — streams to S3, writes Redis metadata on success.
- `GET /artifacts/:artifactId/signed-url?ttl=300` — returns a time-limited signed URL (S3 presign) for direct client fetch via CDN.
- `POST /pin { sceneId, ttlMs }` (tenant admin).
- `GET /stats?tenantId=...` — aggregate cache size, hit rate (joined from OTel metrics), top scenes.

## TS client

```ts
interface CacheClient {
  putScene(scene: Scene, artifacts: { keyframe: ReadableStream<Uint8Array>, hitmap: Uint8Array, transition?: ReadableStream<Uint8Array> }, opts?: { ttlMs?: number; pin?: boolean }): Promise<void>;
  getScene(sceneId: SceneId): Promise<CacheSceneEntry | null>;
  signedUrl(artifactId: ArtifactId, opts?: { ttlMs?: number }): Promise<string>;
  // batch convenience
  putTransition(transition: TransitionEntry, bytes: ReadableStream<Uint8Array>): Promise<void>;
}
```

## Implementation mandates

- All uploads use **multipart** for > 8 MiB; concurrency 4.
- Sign S3 keys with tenant-scoped IAM credentials where possible (one-access-policy-per-tenant if S3 deployment). R2 does this via bucket binding.
- **CDN-origin pull**: S3/R2 bucket is configured as origin for Cloudflare (prompt 21); signed URLs are the standard client fetch path.
- **Retries**: exponential backoff on S3 transient errors; idempotent (content-addressed keys make re-PUT safe).
- **Integrity**: on GET, the object is streamed through a BLAKE3 verifier; mismatches logged + alert; serve 502 on content tamper.
- **Auth**: service-to-service JWT (HS256 with shared secret) between orchestrator ↔ cache ↔ edge worker. Public endpoints (`/stats`) require tenant-scoped JWT.

## Test plan

- Integration tests against **MinIO** and a real Redis via testcontainers.
- Scenarios:
  - Put scene with 2 MiB keyframe; GET returns metadata; signedUrl fetches content; BLAKE3 matches.
  - Stream a 50 MiB video clip; upload completes without memory spike > 100 MiB in the server process.
  - TTL expiry: insert with `ttlMs: 1000`; wait 2s; GET returns 404; GC worker deleted the object.
  - Concurrent PUTs with same content-addressed key: exactly one succeeds writing, others idempotently confirm.
  - Tenant isolation: one tenant's signedUrl cannot retrieve another tenant's artifact.
  - CDN purge on delete: invalidation webhook issued.
- Load: 500 req/s `GET /scenes/:id` — p99 < 30ms.

## Deliverables

- `packages/cache-server/src/{server.ts, redis.ts, s3.ts, gc.ts, signed-urls.ts, tenant.ts, types.ts}`.
- Dockerfile.
- `packages/cache-server/README.md` with config env, deploy, sizing.
- Integration tests + CI.

## Acceptance criteria

- All scenarios green.
- No OOM on large-clip uploads.
- CDN integration proven via end-to-end test against a live Cloudflare R2 zone (CI secrets).

## Non-goals

- No client-side cache (prompt 08).
- No CDN worker code (prompt 21).
- No model artifacts (LoRAs, checkpoints); this cache stores user-facing artifacts only.
