# 03 — Content-Addressed Cache Key Spec

## Project context

Sketchapedia's economics depend on cache hit rate. A user's click that matches a cached `(previous_scene, intent, state_delta, style_ref)` tuple serves the result from CDN in ~50ms; a miss costs $0.01–$0.10 in GPU time. The cache key derivation must be **deterministic across clients, servers, workers, and languages**, because a cache entry written by the orchestrator in Python is read by the edge worker in TypeScript and by the client SDK in the browser.

See `prompts/00-vision.md`.

## Your task

Define the canonical algorithm for deriving `SceneId`, `TransitionId`, and `ArtifactId` from structured inputs. Implement the derivation in TypeScript (`@sketchapedia/cache-keys`) and ship a reference specification (`SPEC.md`) that any other runtime (Python, Rust, Workers) must reproduce bit-for-bit.

## Technical requirements

- Hash function: **BLAKE3** (`@noble/hashes/blake3`). Produces 256-bit output; encode as URL-safe base32 without padding (RFC 4648), lowercased, truncated to 32 characters for keys (≈160 bits of entropy — collision-free at web scale).
- Canonical JSON: **RFC 8785 (JCS — JSON Canonicalization Scheme)**. Implement or use a vetted library; do not invent a canonicalization.
- Byte stream: `domain_tag || null_byte || canonical_json_utf8`. The domain tag prevents cross-use collisions (e.g. a scene key can never collide with a transition key).
- All numeric state in `state_delta` normalized before hashing: floats rounded to `1e-9` precision; `-0` → `0`; `NaN` / `Infinity` rejected.
- String inputs NFC-normalized.
- Intent payloads sorted by key recursively before canonicalization.

## Key derivation functions

```ts
sceneId({
  previousSceneId: SceneId | null,   // null for root scenes
  intent: { name: IntentName, payload: JsonValue },
  stateDelta: JsonPatchOp[],
  styleRef: string | null,           // hash of a reference image, for style continuity
  protocolVersion: string,           // "1.0"
  modelChannel: string               // e.g. "flux-dev@v1.2,ltx-video@v0.9"
}): SceneId

transitionId({
  fromSceneId: SceneId,
  toSceneId: SceneId,
  modelChannel: string,
  protocolVersion: string
}): TransitionId

artifactId({
  kind: "keyframe" | "hitmap" | "transition" | "audio",
  sceneId: SceneId,
  format: string                     // "image/webp", "application/json", "video/mp4;codecs=av1", etc.
}): ArtifactId
```

### Domain tags (byte-exact strings, hashed as prefix)

- `sketchapedia:v1:scene`
- `sketchapedia:v1:transition`
- `sketchapedia:v1:artifact`

## Storage URL derivation

Given an `artifactId`, the canonical object key in S3/R2 is:

```
sketchapedia/v1/artifacts/<first2chars>/<next2chars>/<remaining>.<extension>
```

Two-char prefix sharding prevents hot partitions. File extension inferred from MIME. CDN URLs layer a signed-URL scheme (prompt 21) on top of this path.

## Implementation mandates

- Pure functions, synchronous, zero I/O. Never read env vars, never touch the network.
- No reliance on `JSON.stringify` for canonicalization — it is not RFC 8785.
- Reject invalid inputs with a `CacheKeyError` that names the offending path (e.g. `"stateDelta[3].value: NaN not permitted"`).
- Expose `canonicalize(json: JsonValue): string` publicly so other services can verify.
- Cross-language parity proven by committing a `golden.json` file: an array of `{ input, expected_key }` entries. CI regenerates `golden.json` from the TS implementation on each run and fails if it diverges from the checked-in copy.

## Test plan

- 100 hand-authored (input, expected_key) pairs in `golden.json` covering: null previous scene, unicode in intent names, nested payloads, float precision edges (`0.1 + 0.2`), empty state deltas, long style refs.
- Property tests (fast-check, 5000 runs): changing any field changes the key; permuting object keys does not; numeric normalization is idempotent.
- Collision stress test: generate 10⁶ random inputs and assert zero collisions in truncated 32-char keys.
- Cross-check against a minimal Python reference script (committed under `packages/cache-keys/compat/python/derive.py`) — CI runs both and compares outputs for the golden set.

## Deliverables

- `packages/cache-keys/src/index.ts` — public API.
- `packages/cache-keys/src/canonical.ts` — JCS implementation.
- `packages/cache-keys/src/blake3.ts` — hashing + base32 encoding.
- `packages/cache-keys/SPEC.md` — authoritative specification, implementable in any language.
- `packages/cache-keys/golden.json` — versioned test vectors.
- `packages/cache-keys/compat/python/derive.py` — reference Python port, executed in CI.
- `packages/cache-keys/README.md` — usage + stability guarantees.

## Acceptance criteria

- All golden vectors pass in TS and Python implementations.
- Property tests green.
- Two `sceneId` calls with inputs differing only by object-key order produce identical keys.
- A `stateDelta` containing `NaN` raises `CacheKeyError` with a non-empty `path`.
- 10⁶-entry collision test completes with zero collisions in < 60 seconds.
- `SPEC.md` includes: pseudocode, reference byte sequences, example hashes, versioning policy.

## Non-goals

- Do not implement cache storage (prompt 20) or CDN signing (prompt 21).
- Do not make the hash function pluggable — BLAKE3 is fixed for v1.
- Do not embed trace/telemetry IDs in the input — those are orthogonal.
