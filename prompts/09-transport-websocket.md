# 09 — Client WebSocket Transport

## Project context

Sketchapedia sends user intents and viewport state to the server over a persistent WebSocket; the server streams back generation progress, scene keyframes, and transition clips. The transport must be resilient to flaky networks, honor backpressure from the decoder, and carry binary payloads with minimal overhead. See `prompts/00-vision.md`.

## Your task

Implement `packages/client-core/src/transport/` — the browser-side transport layer. Single `Transport` instance per client, fronts all network I/O to the server, exposes request/stream semantics on top of the protocol's message types.

## Technical requirements

- **Primary channel**: WebSocket over `wss://`. `binaryType = "arraybuffer"`. CBOR-encoded frames (prompt 02).
- **Reconnect**: exponential backoff with jitter (base 500ms, cap 30s, jitter ±30%). Resumes subscriptions on reconnect via server-issued `sessionId` from `ServerHello`.
- **Heartbeat**: client sends `ClientHeartbeat` every 20s; disconnects and reconnects if two consecutive `ServerHeartbeat` replies are missed.
- **Multiplexing**: each `ClientIntent` carries a `correlationId`; server responses (`GenerationProgress`, `SceneReady`, `TransitionReady`, `ErrorFrame`) route back to the originating request via correlation ID. Implementation: an internal `Map<correlationId, Writer>`.
- **Backpressure**: expose `bufferedAmount` and a high-water mark; outgoing frames over threshold pause until drained.
- **Cancellation**: every request returns an `AsyncIterable<ServerMessage>` and an `AbortController`-like handle. Aborting sends a server-side `CancelRequest` frame and drops local buffers.
- **Binary streams** for transition clips: server may push `TransitionReady` with a URL pointing to CDN, or (optional) chunked inline via a secondary `binaryChannel` message carrying ordered chunks. Both paths supported.
- **Priority queue**: user-initiated intents preempt prefetches (declared via a header on the request).
- **Observability**: every request/response logs a W3C traceparent; server is expected to propagate.

## Public API

```ts
interface Transport {
  connect(url: string, authToken: string): Promise<void>;
  disconnect(reason?: string): void;

  request(
    intent: ClientIntent,
    opts?: { priority?: "user" | "prefetch"; signal?: AbortSignal; traceparent?: string }
  ): AsyncIterable<ServerMessage>;

  ack(sceneId: SceneId): void;  // fire-and-forget

  readonly state: Observable<"disconnected" | "connecting" | "connected" | "reconnecting" | "failed">;
  readonly metrics: TransportMetrics; // bufferedAmount, rtt, reconnectCount, msgIn, msgOut
  readonly events: EventSource<TransportEvent>;
}
```

## Implementation mandates

- Pure browser code, no polyfills. Use the native `WebSocket`.
- Never surface raw `MessageEvent` — decode, validate against protocol Zod schema, dispatch. Invalid frames emit a typed `ProtocolViolation` event and do not crash the transport.
- `request` is lazy: consuming the AsyncIterable triggers the send; abandoning it without consumption is a warning (emitted once).
- Credentials: auth token transmitted in `ClientHello`. Rotating tokens honored by re-issuing hello without reconnect when the token refreshes (if the server advertises the `hello.refresh` capability).
- Frames exceeding the protocol's size limit are rejected pre-send with a typed error.
- No global singletons; consumers instantiate. Documentation strongly recommends one instance per application tab.

## Reconnect logic

- On socket close, if clean close (code 1000, 1001), set state `disconnected` and stop.
- Otherwise enter `reconnecting`. Reopen socket; replay `ClientHello` with the previous `sessionId` if present.
- Outstanding subscriptions with correlations are re-subscribed automatically (client stores replayable intent envelopes for active streams). Server decides to serve from cache or regenerate.
- After 10 consecutive failures, enter `failed`; consumer must explicitly reconnect.

## Test plan

- Unit tests with a real local WebSocket echo server spun up via `ws` package (not a mock — this is a test harness, not production code; the real server is prompt 14).
- Scenarios:
  - Connect, hello exchange completes, state reaches `connected`.
  - Request returns AsyncIterable; consume until `SceneReady`; stream closes cleanly.
  - Abort mid-stream: server receives `CancelRequest`; iterable completes.
  - Socket forcibly closed: state transitions to `reconnecting`; new connection established; in-flight subscriptions resume.
  - Heartbeat timeout: two missed `ServerHeartbeat` → reconnect cycle triggered.
  - Invalid frame: emits `ProtocolViolation`; transport remains healthy.
  - Backpressure: 1000 rapid frames, `bufferedAmount` threshold triggers pause; drains; state healthy.
- Integration test against the real gateway (prompt 14) once both land.

## Deliverables

- `packages/client-core/src/transport/{transport.ts, reconnect.ts, heartbeat.ts, priority-queue.ts, correlation.ts, types.ts}`.
- Tests.
- `packages/client-core/README-transport.md`.

## Acceptance criteria

- Lost-network test (`toggle offline/online` via Playwright CDP) survives 5 consecutive disconnects without data loss or duplicate scene commits.
- p99 round-trip for a trivial echo request < 20ms over localhost.
- No memory leak after 10 000 request/response cycles.

## Non-goals

- No HTTP fetching (covered by the SW in prompt 08 and CDN in prompt 21).
- No server implementation (prompt 14).
- No auth provisioning (prompt 26).
