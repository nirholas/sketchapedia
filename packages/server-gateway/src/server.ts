/**
 * HTTP + WebSocket server.
 *
 * Routes (Hono):
 *   - GET  /healthz  — 200 if the process is alive
 *   - GET  /readyz   — 200 if Redis and the orchestrator are reachable
 *   - GET  /metrics  — Prometheus text format
 *   - GET  /ws       — WebSocket upgrade
 *
 * The WebSocket layer uses Bun's native `Bun.serve({ websocket })` when the
 * runtime is Bun; it falls back to the `ws` package for Node-based tests and
 * local development without Bun installed. The business logic
 * (`WebSocketHandler`, `Connection`) is runtime-agnostic.
 */

import { Hono } from 'hono';
import { Redis } from 'ioredis';

import type { Verifier } from './auth.ts';
import { createVerifier, extractBearer } from './auth.ts';
import type { GatewayConfig } from './config.ts';
import type { Logger } from './logger.ts';
import { createLogger } from './logger.ts';
import { type GatewayMetrics, createMetrics } from './metrics.ts';
import type { OrchestratorClient } from './orchestrator.ts';
import { createOrchestratorClient } from './orchestrator.ts';
import { ErrorCode, ProtocolError } from './protocol/index.ts';
import type { RateLimiter } from './ratelimit.ts';
import { createRateLimiter } from './ratelimit.ts';
import type { SessionStore } from './session.ts';
import { createSessionStore } from './session.ts';
import { type Shutdown, createShutdown } from './shutdown.ts';
import type { Telemetry } from './telemetry.ts';
import { startTelemetry } from './telemetry.ts';
import { CloseCode, type Connection, WebSocketHandler } from './websocket.ts';

export interface GatewayDeps {
  readonly config: GatewayConfig;
  readonly logger: Logger;
  readonly metrics: GatewayMetrics;
  readonly redis: Redis;
  readonly verifier: Verifier;
  readonly orchestrator: OrchestratorClient;
  readonly rateLimiter: RateLimiter;
  readonly sessionStore: SessionStore;
  readonly shutdown: Shutdown;
  readonly telemetry: Telemetry;
}

export interface GatewayHandle {
  readonly deps: GatewayDeps;
  readonly port: number;
  readonly host: string;
  stop(reason?: string): Promise<void>;
}

/** Wire up dependencies without starting a listener. Useful for tests. */
export async function buildGateway(config: GatewayConfig): Promise<GatewayDeps> {
  const logger = createLogger(config);
  const telemetry = startTelemetry(config);
  const metrics = createMetrics(config);

  const redis = new Redis(config.redis.url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true,
    keyPrefix: '',
    connectionName: config.serviceName,
  });
  redis.on('error', (err: Error) => logger.error({ err }, 'redis error'));

  const verifier = await createVerifier(config);
  const orchestrator = createOrchestratorClient(config, logger);
  const rateLimiter = createRateLimiter(redis, config);
  const sessionStore = createSessionStore(redis, config);
  const shutdown = createShutdown(config, logger, metrics);

  return {
    config,
    logger,
    metrics,
    redis,
    verifier,
    orchestrator,
    rateLimiter,
    sessionStore,
    shutdown,
    telemetry,
  };
}

/** Build the Hono app. Exposed for test injection. */
export function createApp(deps: GatewayDeps): Hono {
  const app = new Hono();

  app.get('/healthz', (c) => {
    if (deps.shutdown.shuttingDown()) {
      return c.json({ status: 'draining' }, 503);
    }
    return c.json({ status: 'ok' }, 200);
  });

  app.get('/readyz', async (c) => {
    if (deps.shutdown.shuttingDown()) {
      return c.json({ status: 'draining' }, 503);
    }
    const [redisOk, orchOk] = await Promise.all([
      deps.redis
        .ping()
        .then(() => true)
        .catch(() => false),
      deps.orchestrator.health(),
    ]);
    const ready = redisOk && orchOk;
    return c.json(
      {
        status: ready ? 'ready' : 'not-ready',
        redis: redisOk,
        orchestrator: orchOk,
      },
      ready ? 200 : 503,
    );
  });

  app.get('/metrics', async (c) => {
    if (!deps.config.env.PROM_METRICS_ENABLED) {
      return c.text('metrics disabled', 404);
    }
    const body = await deps.metrics.registry.metrics();
    return c.text(body, 200, { 'content-type': deps.metrics.registry.contentType });
  });

  return app;
}

/**
 * Start the service on a Bun runtime. Returns a handle whose `stop()` method
 * drains connections gracefully.
 *
 * When the runtime is not Bun (e.g. Vitest on Node), this function falls
 * back to `ws` + `node:http`; the interface is identical.
 */
export async function startGateway(config: GatewayConfig): Promise<GatewayHandle> {
  const deps = await buildGateway(config);
  const app = createApp(deps);

  const handler = new WebSocketHandler({
    config: deps.config,
    logger: deps.logger,
    metrics: deps.metrics,
    verifier: deps.verifier,
    rateLimiter: deps.rateLimiter,
    sessionStore: deps.sessionStore,
    orchestrator: deps.orchestrator,
    shutdownSignal: deps.shutdown.signal,
    registerConnection: (c) => deps.shutdown.register(c),
    deregisterConnection: (id) => deps.shutdown.deregister(id),
  });

  const runtime = (globalThis as { Bun?: unknown }).Bun ? 'bun' : 'node';
  const stopper =
    runtime === 'bun' ? await startBun(app, handler, deps) : await startNode(app, handler, deps);

  installSignalHandlers(deps);

  deps.logger.info(
    {
      runtime,
      host: deps.config.env.GATEWAY_HOST,
      port: deps.config.env.GATEWAY_PORT,
      serviceName: deps.serviceName ?? deps.config.serviceName,
      instanceId: deps.config.instanceId,
    },
    'gateway listening',
  );

  return {
    deps,
    port: deps.config.env.GATEWAY_PORT,
    host: deps.config.env.GATEWAY_HOST,
    async stop(reason = 'programmatic stop'): Promise<void> {
      await deps.shutdown.initiate(reason);
      await stopper();
      await deps.redis.quit().catch(() => deps.redis.disconnect());
      await deps.telemetry.shutdown();
    },
  };
}

// ---------------------------------------------------------------------------
// runtime adapters
// ---------------------------------------------------------------------------

type Stopper = () => Promise<void>;

async function startBun(app: Hono, handler: WebSocketHandler, deps: GatewayDeps): Promise<Stopper> {
  // Typed as `any` to avoid a hard dependency on Bun's globals at compile time.
  const Bun = (globalThis as unknown as { Bun: BunGlobal }).Bun;

  interface WsData {
    readonly conn: Connection;
  }

  const server = Bun.serve<WsData>({
    port: deps.config.env.GATEWAY_PORT,
    hostname: deps.config.env.GATEWAY_HOST,
    async fetch(req, srv): Promise<Response> {
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
        if (deps.shutdown.shuttingDown()) {
          return new Response('draining', { status: 503 });
        }
        const bearer = extractBearer(req);
        // Pass bearer via socket data; the hello handler uses it if the frame
        // does not supply one.
        const bunSocket = Object.create(null);
        const placeholder = {
          readyState: 1,
          send: () => undefined,
          close: () => undefined,
        };
        const conn = handler.open(placeholder as never, { bearer });
        (bunSocket as { conn: Connection }).conn = conn;
        if (srv.upgrade(req, { data: bunSocket })) return undefined as unknown as Response;
        return new Response('upgrade failed', { status: 400 });
      }
      return app.fetch(req);
    },
    websocket: {
      maxPayloadLength: deps.config.protocol.maxFrameBytes,
      idleTimeout: Math.ceil(deps.config.protocol.idleTimeoutMs / 1000),
      perMessageDeflate: false,
      async open(ws): Promise<void> {
        // Replace the placeholder socket with the real one, preserving connection identity.
        const conn = ws.data.conn;
        (conn as unknown as { ws: WsSend }).ws = {
          readyState: 1,
          send: (bytes) => ws.send(bytes as never, true),
          close: (code, reason) => ws.close(code, reason),
        };
      },
      async message(ws, data): Promise<void> {
        await ws.data.conn.handleMessage(data as never);
      },
      close(ws, code, reason): void {
        ws.data.conn.handleClose(code, reason);
      },
      drain(): void {
        // Flow control: Bun will pause reads; nothing to do here since we
        // back-pressure by awaiting orchestrator streams per-intent.
      },
    },
  });

  return async () => {
    try {
      server.stop(true);
    } catch (err) {
      deps.logger.warn({ err }, 'bun server stop error');
    }
  };
}

async function startNode(
  app: Hono,
  handler: WebSocketHandler,
  deps: GatewayDeps,
): Promise<Stopper> {
  const http = await import('node:http');
  const { WebSocketServer } = await import('ws');

  const server = http.createServer(async (req, res) => {
    try {
      const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
      const request = new Request(url, {
        method: req.method ?? 'GET',
        headers: req.headers as Record<string, string>,
      });
      const response = await app.fetch(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const body = response.body ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
      res.end(body);
    } catch (err) {
      deps.logger.error({ err }, 'http request failed');
      res.statusCode = 500;
      res.end('internal error');
    }
  });

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: deps.config.protocol.maxFrameBytes,
  });

  server.on('upgrade', (req, socket, head) => {
    if (deps.shutdown.shuttingDown()) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Convert `ws` events into our handler.
      const request = new Request(url, {
        headers: req.headers as Record<string, string>,
      });
      const bearer = extractBearer(request);

      const socketLike = {
        get readyState(): number {
          return ws.readyState;
        },
        send: (bytes: Uint8Array | ArrayBuffer) => {
          ws.send(bytes as never, { binary: true });
        },
        close: (code?: number, reason?: string) => {
          try {
            ws.close(code, reason);
          } catch {
            /* already closed */
          }
        },
      };

      const conn = handler.open(socketLike, { bearer });

      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary) => {
        const payload =
          data instanceof Buffer
            ? data
            : Array.isArray(data)
              ? Buffer.concat(data)
              : Buffer.from(data);
        void conn.handleMessage(isBinary ? payload : payload.toString('utf8'));
      });
      ws.on('close', (code, reason) => conn.handleClose(code, reason.toString()));
      ws.on('error', (err: Error) => {
        deps.logger.warn({ err, connId: conn.id }, 'ws error');
        conn.handleClose(CloseCode.INTERNAL_ERROR, err.message);
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(deps.config.env.GATEWAY_PORT, deps.config.env.GATEWAY_HOST, () => resolve());
  });

  return async () => {
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };
}

function installSignalHandlers(deps: GatewayDeps): void {
  const once = (signal: NodeJS.Signals): void => {
    process.once(signal, () => {
      deps.logger.info({ signal }, 'signal received; draining');
      deps.shutdown.initiate(signal).catch((err) => {
        deps.logger.error({ err }, 'shutdown failed');
        process.exit(1);
      });
    });
  };
  once('SIGTERM');
  once('SIGINT');
}

// ---------------------------------------------------------------------------
// Bun typing shim. We avoid `@types/bun` to keep the dependency surface small;
// only the fields the gateway uses are declared here.
// ---------------------------------------------------------------------------

interface WsSend {
  readonly readyState: number;
  send(bytes: Uint8Array | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

interface BunGlobal {
  serve<Data>(opts: BunServeOptions<Data>): BunServer;
}

interface BunServer {
  stop(immediate?: boolean): void;
  readonly port: number;
  readonly hostname: string;
}

interface BunServeOptions<Data> {
  port?: number;
  hostname?: string;
  fetch(
    req: Request,
    srv: { upgrade(req: Request, opts?: { data?: unknown }): boolean },
  ): Response | Promise<Response>;
  websocket: {
    maxPayloadLength?: number;
    idleTimeout?: number;
    perMessageDeflate?: boolean;
    open?(ws: BunWebSocket<Data>): void | Promise<void>;
    message(ws: BunWebSocket<Data>, data: ArrayBuffer | Uint8Array | string): void | Promise<void>;
    close?(ws: BunWebSocket<Data>, code: number, reason: string): void;
    drain?(ws: BunWebSocket<Data>): void;
  };
}

interface BunWebSocket<Data> {
  readonly data: Data;
  send(data: ArrayBuffer | Uint8Array | string, compress?: boolean): number;
  close(code?: number, reason?: string): void;
  ping?(): void;
}

// Shim: `ProtocolError` and `ErrorCode` are re-exported so callers that
// import `from '@sketchapedia/server-gateway'` can reach the wire errors
// without pulling in the protocol submodule directly.
export { ErrorCode, ProtocolError };
