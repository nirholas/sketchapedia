/**
 * Host-agnostic implementation layer behind the React bindings.
 *
 * The React surface (hooks, `<SketchapediaProvider>`, Suspense integration)
 * lands with prompt 10 and needs three things that are independent of React
 * itself, and therefore live here where they can be unit-tested without a
 * renderer:
 *
 *  1. **Path utilities.** Scene state is addressed by dot/bracket paths in
 *     component code (`useField('form.name')`) but by RFC 6901 JSON Pointers on
 *     the wire. Both directions have to agree exactly, so both live in one file.
 *  2. **A stub core.** A `@sketchapedia/client-core` session drives a canvas, a
 *     WebSocket, and a GPU budget. Bindings need none of that to be exercised:
 *     they need something that holds a scene, applies deltas, dispatches
 *     actions, and emits events. `createStubCore` is that contract, in memory.
 *  3. **A Suspense bridge.** React Suspense signals "not ready" by throwing a
 *     promise. Generation is not a data fetch, so there is no cache to hang
 *     that promise off; the bridge owns it, scoped per core instance.
 */

// ───────────────────────────── json-pointer ────────────────────────────────

/** A single addressable step: an object key, or an array index. */
export type PathSegment = string | number;

const BRACKET = /\[(\d+)\]/g;

/**
 * Splits a dot/bracket path into segments. Numeric bracket indices become
 * numbers so that writers know to materialise an array rather than an object.
 *
 * `'items[2].name'` becomes `['items', 2, 'name']`.
 */
export function parsePath(path: string): PathSegment[] {
  if (path.length === 0) return [];
  const normalised = path.replace(BRACKET, '.$1');
  const out: PathSegment[] = [];
  for (const part of normalised.split('.')) {
    if (part.length === 0) continue;
    out.push(/^\d+$/.test(part) ? Number(part) : part);
  }
  return out;
}

/** Reads a dot/bracket path out of a tree, returning `undefined` for any miss. */
export function readPath(tree: unknown, path: string): unknown {
  return readSegments(tree, parsePath(path));
}

function readSegments(tree: unknown, segments: readonly PathSegment[]): unknown {
  let node: unknown = tree;
  for (const segment of segments) {
    if (node === null || node === undefined) return undefined;
    if (typeof segment === 'number') {
      if (!Array.isArray(node)) return undefined;
      node = node[segment];
      continue;
    }
    if (typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * Returns a copy of `tree` with `path` set to `value`. The input is never
 * mutated: every node along the path is cloned, everything else is shared, so
 * React reference equality still short-circuits untouched subtrees.
 *
 * Missing intermediate nodes are created. A numeric segment creates an array,
 * a string segment creates an object.
 */
export function writePath(tree: unknown, path: string, value: unknown): unknown {
  return writeSegments(tree, parsePath(path), value);
}

function writeSegments(node: unknown, segments: readonly PathSegment[], value: unknown): unknown {
  const [head, ...rest] = segments;
  if (head === undefined) return value;

  if (typeof head === 'number') {
    const source: unknown[] = Array.isArray(node) ? node : [];
    const next = source.slice();
    next[head] = writeSegments(next[head], rest, value);
    return next;
  }

  const source =
    node !== null && typeof node === 'object' && !Array.isArray(node)
      ? (node as Record<string, unknown>)
      : {};
  return { ...source, [head]: writeSegments(source[head], rest, value) };
}

/** Escapes a single JSON Pointer reference token per RFC 6901 section 3. */
function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Converts a dot/bracket path to an RFC 6901 JSON Pointer. */
export function toJsonPointer(path: string): string {
  const segments = parsePath(path);
  if (segments.length === 0) return '';
  return `/${segments.map((s) => escapeToken(String(s))).join('/')}`;
}

/** Parses an RFC 6901 JSON Pointer into segments, inverting `toJsonPointer`. */
export function fromJsonPointer(pointer: string): PathSegment[] {
  if (pointer.length === 0 || pointer === '/') return [];
  const body = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  return body.split('/').map((token) => {
    const decoded = unescapeToken(token);
    return /^\d+$/.test(decoded) ? Number(decoded) : decoded;
  });
}

// ─────────────────────────────── stub core ─────────────────────────────────

/** A rendered scene as far as the bindings are concerned. */
export interface Scene {
  readonly id: string;
  readonly state?: Record<string, unknown>;
  readonly summary?: string;
  readonly locale?: string;
}

/** A user- or code-initiated intent handed to the orchestrator. */
export interface CoreAction {
  readonly name: string;
  readonly source?: string;
  readonly payload?: unknown;
}

/** JSON Patch operation subset the client applies to scene state. */
export interface StateDeltaOp {
  readonly op: 'add' | 'replace' | 'remove';
  readonly path: string;
  readonly value?: unknown;
}

export type TransportStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';

export type CoreEvent =
  | { readonly type: 'scene'; readonly scene: Scene }
  | { readonly type: 'commit'; readonly scene: Scene }
  | { readonly type: 'transport'; readonly status: TransportStatus }
  | { readonly type: 'error'; readonly error: unknown };

export type CoreListener = (event: CoreEvent) => void;

export interface DispatchResult {
  readonly sceneId: string;
  readonly cacheHit: boolean;
}

export interface PendingDispatch {
  readonly action: CoreAction;
  readonly startedAt: number;
}

export interface HistoryEntry {
  readonly kind: 'delta' | 'dispatch' | 'commit' | 'intent' | 'transport';
  readonly at: number;
  readonly summary: string;
}

export interface CoreSnapshot {
  readonly scene: Scene | null;
  readonly transport: TransportStatus;
  readonly pending: readonly PendingDispatch[];
  readonly history: readonly HistoryEntry[];
}

export interface StubCoreOptions {
  readonly rootScene: Scene;
  readonly container: HTMLElement;
  readonly config: Readonly<Record<string, unknown>>;
  readonly signal: AbortSignal;
  /** Resolves an action to the next scene. Omit to model a pure cache hit. */
  readonly onDispatch?: (action: CoreAction) => Scene | Promise<Scene>;
}

export interface StubCore {
  subscribe(listener: CoreListener): () => void;
  getScene(): Scene | null;
  getPending(): readonly PendingDispatch[];
  snapshot(): CoreSnapshot;
  applyStateDelta(ops: readonly StateDeltaOp[]): void;
  readField(path: string): unknown;
  setField(path: string, value: unknown): void;
  setLocale(locale: string): void;
  setTransport(status: TransportStatus): void;
  preload(intents: readonly { readonly intent: string }[]): void;
  dispatch(action: CoreAction): Promise<DispatchResult>;
  dispose(): void;
}

/**
 * The history log is unbounded in principle (every keystroke is a delta), so
 * it is capped. 200 entries is enough to cover a devtools timeline without
 * letting a long-lived session retain arbitrary state values forever.
 */
const HISTORY_LIMIT = 200;

/**
 * An in-memory `client-core` stand-in: real event plumbing, real immutable
 * state transitions, no renderer and no network.
 */
export function createStubCore(options: StubCoreOptions): StubCore {
  const listeners = new Set<CoreListener>();
  const pending: PendingDispatch[] = [];
  const history: HistoryEntry[] = [];
  let scene: Scene | null = options.rootScene;
  let transport: TransportStatus = 'connected';
  let disposed = false;

  function record(kind: HistoryEntry['kind'], summary: string): void {
    history.push({ kind, at: Date.now(), summary });
    if (history.length > HISTORY_LIMIT) history.splice(0, history.length - HISTORY_LIMIT);
  }

  function emit(event: CoreEvent): void {
    for (const listener of [...listeners]) listener(event);
  }

  function commitScene(next: Scene, kind: 'scene' | 'commit'): void {
    scene = next;
    emit({ type: kind, scene: next });
  }

  function writeState(segments: readonly PathSegment[], value: unknown): void {
    if (scene === null || segments.length === 0) return;
    const nextState = writeSegments(scene.state ?? {}, segments, value) as Record<string, unknown>;
    commitScene({ ...scene, state: nextState }, 'scene');
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    pending.length = 0;
  }

  options.signal.addEventListener('abort', dispose, { once: true });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getScene() {
      return scene;
    },

    getPending() {
      return [...pending];
    },

    snapshot() {
      return {
        scene,
        transport,
        pending: [...pending],
        history: [...history],
      };
    },

    applyStateDelta(ops) {
      for (const op of ops) {
        writeState(fromJsonPointer(op.path), op.op === 'remove' ? undefined : op.value);
        record('delta', `${op.op} ${op.path}`);
      }
    },

    readField(path) {
      return readPath(scene?.state, path);
    },

    setField(path, value) {
      writeState(parsePath(path), value);
      record('delta', `set ${path}`);
    },

    setLocale(locale) {
      if (scene === null) return;
      commitScene({ ...scene, locale }, 'scene');
      record('delta', `locale ${locale}`);
    },

    setTransport(status) {
      transport = status;
      emit({ type: 'transport', status });
      record('transport', status);
    },

    preload(intents) {
      record('intent', intents.map((i) => i.intent).join(', '));
    },

    async dispatch(action) {
      if (disposed) throw new Error('cannot dispatch on a disposed core');

      const entry: PendingDispatch = { action, startedAt: Date.now() };
      pending.push(entry);
      record('dispatch', action.name);

      try {
        if (options.onDispatch === undefined) {
          // No resolver wired: the scene is already on screen, so this is the
          // steady-state path the architecture optimises for, a pure cache hit.
          return { sceneId: scene?.id ?? options.rootScene.id, cacheHit: true };
        }
        const next = await options.onDispatch(action);
        commitScene(next, 'commit');
        record('commit', next.id);
        return { sceneId: next.id, cacheHit: false };
      } catch (error) {
        emit({ type: 'error', error });
        throw error;
      } finally {
        const at = pending.indexOf(entry);
        if (at !== -1) pending.splice(at, 1);
      }
    },

    dispose,
  };
}

// ───────────────────────────── suspense bridge ─────────────────────────────

/**
 * React Suspense contract: throw a promise while work is in flight, throw an
 * error once it has failed, return normally once it is ready.
 */
export interface SuspenseBridge {
  waitForReady(): void;
  markPending(): void;
  markResolved(): void;
  markRejected(error: unknown): void;
}

interface BridgeState {
  status: 'resolved' | 'pending' | 'rejected';
  promise: Promise<void> | null;
  resolve: (() => void) | null;
  error: unknown;
}

function createSuspenseBridge(): SuspenseBridge {
  const state: BridgeState = { status: 'resolved', promise: null, resolve: null, error: null };

  function settle(): void {
    const resolve = state.resolve;
    state.promise = null;
    state.resolve = null;
    // Always *resolve* the thrown promise, never reject it. React only uses it
    // as a retry signal, and a rejected promise nobody awaits surfaces as an
    // unhandled rejection. The retry re-enters waitForReady, which throws the
    // real error with its original stack.
    if (resolve) resolve();
  }

  return {
    waitForReady() {
      if (state.status === 'rejected') throw state.error;
      if (state.status === 'pending' && state.promise !== null) throw state.promise;
    },

    markPending() {
      if (state.status === 'pending') return;
      state.status = 'pending';
      state.error = null;
      state.promise = new Promise<void>((resolve) => {
        state.resolve = resolve;
      });
    },

    markResolved() {
      state.status = 'resolved';
      state.error = null;
      settle();
    },

    markRejected(error) {
      state.status = 'rejected';
      state.error = error;
      settle();
    },
  };
}

const bridges = new WeakMap<StubCore, SuspenseBridge>();

/**
 * Returns the Suspense bridge for a core, creating it on first use. Scoping is
 * per core instance so that two providers on one page suspend independently.
 */
export function getSuspenseBridge(core: StubCore): SuspenseBridge {
  const existing = bridges.get(core);
  if (existing) return existing;
  const bridge = createSuspenseBridge();
  bridges.set(core, bridge);
  return bridge;
}
