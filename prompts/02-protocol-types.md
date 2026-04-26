# 02 — Protocol & Shared Types

## Project context

Sketchapedia is a Model-as-a-Renderer SDK: generative models produce UI imagery, an invisible DOM overlay carries input/state/a11y. The client and server communicate over WebSocket. Scenes, hitmaps, intents, and transitions are the shared vocabulary. **This prompt defines the single source of truth for every boundary in the system** — if it is ambiguous here, the bug surfaces everywhere.

See `prompts/00-vision.md` for full vision.

## Your task

Populate `packages/protocol` with exhaustive, strict TypeScript types, Zod schemas for runtime validation at every boundary, binary serialization definitions, and an authoritative JSON-Schema export consumable by non-TS services.

## Technical requirements

- TypeScript 5.6+ strict.
- **Zod v3.23+** (or v4 once stable) for runtime schemas. Every wire-level type has a Zod schema; types are derived via `z.infer`, not hand-written twice.
- **CBOR** binary serialization via `cbor-x` for WebSocket payloads. JSON for HTTP debug endpoints.
- Semantic versioning in the protocol itself: every message carries a `protocolVersion: "1.0"` field. A `VersionMismatchError` is a first-class type.
- JSON-Schema generation via `zod-to-json-schema`; emitted under `dist/schemas/*.json`.

## Types to define

### Core domain

- `SceneId` — branded `string` (opaque, content-addressed; see prompt 03).
- `IntentName` — branded `string`, snake_case convention.
- `Polygon` — `[number, number][]` with at least 3 points, all finite.
- `BBox` — `{ x: number, y: number, w: number, h: number }`, non-negative dimensions.
- `Region` — discriminated union: `{ kind: "bbox", bbox: BBox } | { kind: "polygon", polygon: Polygon }`.
- `InputKind` — `"text" | "password" | "email" | "number" | "textarea" | "checkbox" | "radio" | "select" | "range" | "file" | "date"`.
- `AriaRole` — constrained subset of WAI-ARIA roles (`button`, `link`, `textbox`, `checkbox`, `slider`, `combobox`, `tab`, etc.).
- `HitmapItem` — `{ id: string, region: Region, role: AriaRole, ariaLabel: string, intent?: { name: IntentName, payload?: JsonValue }, input?: { kind: InputKind, name: string, required?: boolean, pattern?: string }, tabIndex?: number, disabled?: boolean }`.
- `Hitmap` — `{ items: HitmapItem[], viewport: { width: number, height: number }, coordinateSpace: "viewport" | "keyframe" }`.
- `Scene` — `{ id: SceneId, version: number, keyframeUrl: string, keyframeHash: string, hitmap: Hitmap, stateSchema: JsonSchema, transitionIn?: TransitionRef, ariaSummary: string, createdAt: string }`. `ariaSummary` is a human-readable description for screen readers to announce on scene entry.
- `TransitionRef` — `{ url: string, hash: string, durationMs: number, codec: "av1" | "h264" | "vp9", frameCount: number }`.
- `StateDelta` — JSON Patch (RFC 6902) operations as `Array<{ op: "add" | "replace" | "remove" | "move" | "copy" | "test", path: string, value?: JsonValue, from?: string }>`.

### WebSocket messages

Every frame is a discriminated union on `type`, carries a `protocolVersion`, a monotonically increasing `seq` per direction, and a `correlationId` for request/response pairing.

Client → Server:
- `ClientHello` — `{ type: "hello", protocolVersion, authToken, capabilities: { codecs: string[], maxKeyframeBytes: number, preferBinary: boolean } }`.
- `ClientIntent` — `{ type: "intent", currentSceneId, intent, stateDelta, styleRef?: string, viewport: { width, height, dpr } }`.
- `ClientAck` — `{ type: "ack", sceneId }` when a scene is committed on client (for telemetry).
- `ClientHeartbeat` — `{ type: "ping", timestamp }`.

Server → Client:
- `ServerHello` — `{ type: "hello", protocolVersion, sessionId, serverFeatures: string[] }`.
- `SceneReady` — `{ type: "scene", scene: Scene, source: "cache" | "generated", generationMs?: number }`.
- `TransitionReady` — `{ type: "transition", sceneId, transition: TransitionRef }` (arrives after keyframe; client may commit on keyframe alone).
- `GenerationProgress` — `{ type: "progress", stage: "layout" | "image" | "video" | "vision", percent: number, etaMs?: number }`.
- `ErrorFrame` — `{ type: "error", code: ErrorCode, message, retriable: boolean, correlationId? }`.
- `ServerHeartbeat` — `{ type: "pong", timestamp, clientTimestamp }`.

### Error codes (enum)

`AUTH_FAILED`, `RATE_LIMITED`, `INVALID_INTENT`, `INVALID_STATE`, `SCENE_NOT_FOUND`, `MODEL_TIMEOUT`, `MODEL_ERROR`, `VERSION_MISMATCH`, `INTERNAL`, `BACKPRESSURE`, `CONTENT_FILTERED`, `UNSUPPORTED_CAPABILITY`. Every code maps to HTTP-like category (4xx/5xx) for logging.

### Additional supporting types

- `JsonValue`, `JsonObject`, `JsonArray` — recursive aliases.
- `JsonSchema` — the draft-2020-12 schema shape, re-exported from `@cfworker/json-schema` typings.
- Cache key inputs — imports from `@sketchapedia/cache-keys` (see prompt 03).
- Telemetry types — `SpanContext`, `TraceHeaders` (W3C traceparent/tracestate).

## Validation surface

- Export `validate<T>(schema: ZodSchema<T>, input: unknown): Result<T, ValidationError>`.
- `ValidationError` carries human-readable path + raw Zod issues + serializable shape.
- A guard `assertMessage<M extends WsMessage>(msg: unknown): M` that throws tagged errors, used at both WS boundaries.

## Serialization

- `encode(message): Uint8Array` using CBOR; `decode(bytes): WsMessage` with schema validation; both exported.
- JSON mirror: `encodeJson`, `decodeJson` for debugging and HTTP endpoints.
- Size limit per frame enforced at encode (default 4 MiB; configurable).

## Implementation mandates

- No `any`. No `unknown` escaping public API without a discriminator.
- Every schema has property-based tests (using `fast-check`) that round-trip `encode → decode` and assert equality.
- Branded types implemented via nominal typing hack (`& { readonly __brand: unique symbol }`) with constructor validators (`SceneId.from(s): SceneId`).
- Version compatibility table in README: `protocolVersion` N is compatible with client/server versions ≥ N, < N+1.
- Generated JSON Schemas regenerated via `pnpm schema` script and checked into `dist/schemas/` on release.

## Deliverables

- `packages/protocol/src/` with domain, messages, errors, branding, validation, encoding split across files.
- `packages/protocol/src/*.test.ts` exercising every schema and the full encode/decode cycle.
- `packages/protocol/README.md` with the protocol specification, error-code semantics, and an upgrade guide.
- `packages/protocol/dist/schemas/*.json` generated from Zod.

## Acceptance criteria

- `pnpm --filter @sketchapedia/protocol test` green with ≥ 95 % line coverage.
- Round-trip encode → decode preserves every field for random inputs (fast-check, 1000 runs per schema).
- JSON Schema export validates a handcrafted sample message via `@cfworker/json-schema` or `ajv`.
- Breaking a field type in `src/domain.ts` causes compile errors in every downstream consumer when `pnpm turbo typecheck` runs repo-wide.
- Size-limit guard rejects a 5 MiB payload; 3 MiB passes.

## Non-goals

- Do not implement WebSocket transport here (that's prompt 09/14).
- Do not implement content-addressed key derivation (that's prompt 03 — import its types).
- Do not leak server-only internals (model vendor names, GPU SKUs) into the protocol.
