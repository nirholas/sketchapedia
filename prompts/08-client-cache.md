# 08 — Client-Side Cache

## Project context

Sketchapedia is cache-first. Most user paths must never reach a GPU. The client cache stores keyframes, transition clips, and hitmap JSON indexed by content-addressed keys (prompt 03). It prefetches likely next scenes based on hitmap intents, evicts by LRU with pin support, and cooperates with the Service Worker / CDN edge to serve assets from IndexedDB + OPFS when the network is slow or offline. See `prompts/00-vision.md`.

## Your task

Implement `packages/client-core/src/cache/` — the persistent client-side scene cache. Expose a clean async API to the router (prompt 07) and transport (prompt 09). Back it with IndexedDB for metadata and the Origin Private File System (OPFS) for large binary blobs.

## Technical requirements

- **IndexedDB** via the native API (no `idb` library dependency; write a tiny typed wrapper). Schema: tables for `scenes`, `transitions`, `blobs_meta`, `prefetch_queue`.
- **OPFS** (`navigator.storage.getDirectory()`) for blob storage — keyframes and video clips. Prefer OPFS over IndexedDB blobs because OPFS has no size cliffs and supports streaming reads.
- Fallback to IndexedDB blobs for browsers without OPFS (Safari < 16.4).
- **Budget**: default 500 MiB aggregate; configurable via `CacheOptions`.
- **Eviction**: LRU with ability to pin entries. Pinned entries never evict; cache surfaces a `QuotaExceededError` when total pinned exceeds budget.
- **Prefetch**: after a scene commits, enumerate its hitmap items; for each `intent` with known target (declared via `intent.payload.prefetch: true`), enqueue a speculative request. Prefetch is lower priority than user intents; deduplicated.
- **Service Worker integration**: a companion SW intercepts fetches for artifact URLs under `/sk-artifacts/*` and serves from OPFS when present. SW is shipped with this package; registration is the consumer's responsibility but helpers are exposed.
- **Integrity**: every blob is verified against its `hash` field on read via streaming BLAKE3; mismatches trigger automatic refetch + telemetry alert.

## Public API

```ts
interface ClientCache {
  init(opts?: CacheOptions): Promise<void>;

  lookup(key: CacheKey): Promise<CacheHit | null>;
  put(entry: CacheEntry): Promise<void>;
  pin(sceneId: SceneId, ttlMs?: number): Promise<void>;
  unpin(sceneId: SceneId): Promise<void>;

  prefetch(requests: PrefetchRequest[]): void;

  stats(): Promise<CacheStats>;
  clear(): Promise<void>;

  readonly events: EventSource<CacheEvent>;
}

type CacheHit = {
  scene: Scene;
  keyframeBlob: Blob | ReadableStream<Uint8Array>;
  transition?: { ref: TransitionRef; stream: ReadableStream<Uint8Array> };
  source: "memory" | "opfs" | "idb" | "sw-origin";
};

type CacheEntry = {
  key: CacheKey;
  scene: Scene;
  keyframe: { bytes: Uint8Array | ReadableStream<Uint8Array>; mime: string };
  transition?: { ref: TransitionRef; bytes: Uint8Array | ReadableStream<Uint8Array> };
  ttlMs?: number;
  pin?: boolean;
};
```

## Lookup flow

1. In-memory LRU (hot — last ~20 scenes) — instant.
2. OPFS — verifies hash while streaming; populates in-memory on success.
3. IndexedDB (blob fallback) — same flow.
4. None: returns `null`.

## Eviction policy

- LRU ordered by last-read timestamp.
- On `put`, compute projected size; if exceeded, evict oldest non-pinned until fits.
- A `pin` with TTL auto-unpins after expiration.
- Surfaces events `evicted`, `pinned`, `unpinned`, `hit`, `miss`, `integrity_failure`.

## Prefetch strategy

- Bounded concurrency: 2 simultaneous prefetches by default.
- Abandonment: if a user intent collides with a prefetch target, the prefetch is upgraded (its in-flight fetch is reused).
- Prefetch only applies to cache misses — if the target is already cached, skip.
- Prefetch priority ordering: items with higher `intent.payload.prefetchWeight` fire first.

## Service Worker

- File: `packages/client-core/src/cache/service-worker.ts` (built via `tsup` with no-bundle mode for SW deployment).
- Claims clients on activation; registers a fetch handler for `/sk-artifacts/` URLs.
- Serves OPFS entries directly; streams to response body.
- Updates in the background (stale-while-revalidate) if a new artifact hash is announced.

## Implementation mandates

- Streaming reads — never materialize entire video blobs into memory.
- Transaction safety: all IDB writes use `oncomplete` with explicit error handling; no `await` on a promise that never resolves.
- Works in cross-origin isolated contexts (required for OPFS + SharedArrayBuffer).
- Telemetry hooks: `hit`, `miss`, `bytes_read`, `bytes_written`, `evicted`, `integrity_failure` emitted via the observability package.
- Quota handling: detect `QuotaExceededError`, run aggressive eviction, retry once; surface a typed error if still blocked.
- Fully typed with `CacheKey` as a branded string (imported from `@sketchapedia/cache-keys`).

## Test plan

- Vitest with `fake-indexeddb` for unit isolation; Playwright for real-browser OPFS + SW.
- Lifecycle: put 100 MiB of scenes, reach budget, evict LRU; assert pinned entries survive.
- Integrity: corrupt an OPFS blob manually; lookup returns `integrity_failure` and refetches.
- SW: register SW in test harness; request `/sk-artifacts/<key>` and verify OPFS-served response; compare bytes.
- Prefetch: synthesize a hitmap with 5 prefetch targets; observe at most 2 concurrent fetches; all eventually complete.
- Browser quota: manually trigger `QuotaExceededError`; verify eviction + retry path.

## Deliverables

- `packages/client-core/src/cache/{index.ts, memory-lru.ts, opfs.ts, idb.ts, service-worker.ts, prefetch.ts, types.ts}`.
- Tests as above.
- `packages/client-core/README-cache.md` with a lifecycle diagram.

## Acceptance criteria

- All tests green across Chromium, Firefox, WebKit where features available.
- Throughput: 100 MiB read from OPFS in < 2 seconds on a mid-range laptop.
- Zero memory leaks after 1000 put/lookup cycles.
- Service Worker activation is idempotent.

## Non-goals

- No server-side cache (prompt 20).
- No signed URLs (prompt 21).
- No UI dev inspector (prompt 23).
- No eviction heuristics based on ML — strict LRU.
