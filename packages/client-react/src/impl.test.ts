import { describe, expect, it, vi } from 'vitest';

import {
  type CoreEvent,
  type Scene,
  createStubCore,
  getSuspenseBridge,
  parsePath,
  readPath,
  toJsonPointer,
  writePath,
} from './impl.js';

// ───────────────────────────── json-pointer ────────────────────────────────

describe('parsePath', () => {
  it('splits dot-paths', () => {
    expect(parsePath('a.b.c')).toEqual(['a', 'b', 'c']);
  });
  it('parses bracketed array indices', () => {
    expect(parsePath('items[2].name')).toEqual(['items', 2, 'name']);
  });
  it('returns empty for empty input', () => {
    expect(parsePath('')).toEqual([]);
  });
});

describe('readPath / writePath', () => {
  it('reads nested and array fields', () => {
    const tree = { form: { name: 'Ada', tags: ['one', 'two'] } };
    expect(readPath(tree, 'form.name')).toBe('Ada');
    expect(readPath(tree, 'form.tags[1]')).toBe('two');
    expect(readPath(tree, 'form.missing')).toBeUndefined();
  });
  it('writes immutably', () => {
    const before = { form: { name: 'Ada' } };
    const after = writePath(before, 'form.name', 'Grace');
    expect(after).toEqual({ form: { name: 'Grace' } });
    expect(before).toEqual({ form: { name: 'Ada' } });
  });
  it('creates intermediate objects and array slots', () => {
    expect(writePath(undefined, 'a.b.c', 42)).toEqual({ a: { b: { c: 42 } } });
    expect(writePath({ list: ['a', 'b'] }, 'list[1]', 'B')).toEqual({ list: ['a', 'B'] });
  });
});

describe('toJsonPointer', () => {
  it('converts dot-paths to RFC 6901 pointers', () => {
    expect(toJsonPointer('form.name')).toBe('/form/name');
    expect(toJsonPointer('items[0].id')).toBe('/items/0/id');
  });
  it('escapes / and ~', () => {
    expect(toJsonPointer('a/b.c~d')).toBe('/a~1b/c~0d');
  });
});

// ─────────────────────────────── stub core ─────────────────────────────────

function rootScene(): Scene {
  return { id: 'home', state: { form: { name: 'Ada' } }, summary: 'Home scene' };
}

function mount() {
  return createStubCore({
    rootScene: rootScene(),
    container: {} as HTMLElement,
    config: {},
    signal: new AbortController().signal,
  });
}

describe('StubCore', () => {
  it('emits scene events on applyStateDelta', () => {
    const core = mount();
    const events: CoreEvent[] = [];
    core.subscribe((ev) => events.push(ev));
    core.applyStateDelta([{ op: 'replace', path: '/form/name', value: 'Grace' }]);
    expect(core.getScene()?.state).toEqual({ form: { name: 'Grace' } });
    expect(events.some((e) => e.type === 'scene')).toBe(true);
  });

  it('setField mutates the scene and records history', () => {
    const core = mount();
    core.setField('form.name', 'Grace');
    expect(core.readField('form.name')).toBe('Grace');
    expect(core.snapshot().history.some((h) => h.kind === 'delta')).toBe(true);
  });

  it('dispatch returns a DispatchResult (cache-hit when no handler)', async () => {
    const core = mount();
    const result = await core.dispatch({ name: 'noop', source: 'user' });
    expect(result.sceneId).toBe('home');
    expect(result.cacheHit).toBe(true);
  });

  it('dispatch with onDispatch commits the returned scene', async () => {
    const next: Scene = { id: 'about', summary: 'About' };
    const core = createStubCore({
      rootScene: rootScene(),
      container: {} as HTMLElement,
      config: {},
      signal: new AbortController().signal,
      onDispatch: () => next,
    });
    const onCommit = vi.fn();
    core.subscribe((ev) => {
      if (ev.type === 'commit') onCommit(ev.scene);
    });
    const result = await core.dispatch({ name: 'open_about' });
    expect(result.sceneId).toBe('about');
    expect(result.cacheHit).toBe(false);
    expect(onCommit).toHaveBeenCalledWith(next);
    expect(core.getScene()?.id).toBe('about');
  });

  it('dispatch surfaces errors and clears pending', async () => {
    const core = createStubCore({
      rootScene: rootScene(),
      container: {} as HTMLElement,
      config: {},
      signal: new AbortController().signal,
      onDispatch: () => {
        throw new Error('boom');
      },
    });
    const errors: unknown[] = [];
    core.subscribe((ev) => {
      if (ev.type === 'error') errors.push(ev.error);
    });
    await expect(core.dispatch({ name: 'bad' })).rejects.toThrow('boom');
    expect(core.getPending()).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('setTransport emits a transport event', () => {
    const core = mount();
    const statuses: string[] = [];
    core.subscribe((ev) => {
      if (ev.type === 'transport') statuses.push(ev.status);
    });
    core.setTransport('reconnecting');
    core.setTransport('connected');
    expect(statuses).toEqual(['reconnecting', 'connected']);
  });

  it('dispose detaches listeners and subsequent dispatch rejects', async () => {
    const core = mount();
    const listener = vi.fn();
    core.subscribe(listener);
    core.dispose();
    core.setTransport('failed');
    expect(listener).not.toHaveBeenCalled();
    await expect(core.dispatch({ name: 'x' })).rejects.toThrow(/disposed/);
  });

  it('bounds the history log to 200 entries', () => {
    const core = mount();
    for (let i = 0; i < 250; i++) {
      core.applyStateDelta([{ op: 'replace', path: '/n', value: i }]);
    }
    expect(core.snapshot().history.length).toBeLessThanOrEqual(200);
  });

  it('setLocale mutates the scene and emits', () => {
    const core = mount();
    core.setLocale('fr');
    expect(core.getScene()?.locale).toBe('fr');
  });

  it('preload records a prefetch history entry', () => {
    const core = mount();
    core.preload([{ intent: 'browse' }, { intent: 'checkout' }]);
    const last = core.snapshot().history.at(-1);
    expect(last?.kind).toBe('intent');
  });
});

// ───────────────────────────── suspense bridge ─────────────────────────────

describe('SuspenseBridge', () => {
  it('is resolved by default — waitForReady is a no-op', () => {
    const bridge = getSuspenseBridge(mount());
    expect(() => bridge.waitForReady()).not.toThrow();
  });

  it('throws the pending promise while a generation is in flight', () => {
    const bridge = getSuspenseBridge(mount());
    bridge.markPending();
    let thrown: unknown = null;
    try {
      bridge.waitForReady();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Promise);
  });

  it('resolves the promise on markResolved', async () => {
    const bridge = getSuspenseBridge(mount());
    bridge.markPending();
    let thrown: Promise<void> | null = null;
    try {
      bridge.waitForReady();
    } catch (err) {
      thrown = err as Promise<void>;
    }
    bridge.markResolved();
    await expect(thrown).resolves.toBeUndefined();
    expect(() => bridge.waitForReady()).not.toThrow();
  });

  it('re-throws the error after markRejected', () => {
    const bridge = getSuspenseBridge(mount());
    bridge.markPending();
    try {
      bridge.waitForReady();
    } catch {
      /* pending */
    }
    bridge.markRejected(new Error('gen failed'));
    expect(() => bridge.waitForReady()).toThrow('gen failed');
  });

  it('is scoped per core instance', () => {
    const a = mount();
    const b = mount();
    expect(getSuspenseBridge(a)).not.toBe(getSuspenseBridge(b));
    expect(getSuspenseBridge(a)).toBe(getSuspenseBridge(a));
  });
});
