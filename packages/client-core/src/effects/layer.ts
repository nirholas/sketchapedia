/**
 * Effects layer — a stacked, pointer-events-none WebGL2 canvas that renders
 * hover / focus / click feedback on top of the scene renderer's output.
 *
 * Why a stacked canvas vs. sharing a context with the renderer: z-ordering
 * is trivial, the effects loop can pause independently, and the scene
 * canvas can ship to disk without effect pixels baked in.
 */

import { type DebugHud, createDebugHud } from './debug-hud.js';
import { DEFAULT_EFFECTS } from './effects.js';
import { createFullscreenQuad, createSpriteAtlas } from './gl.js';
import type { CoordinateMapper, Hitmap, HitmapItem, Point } from './protocol-types.js';
import { type Scheduler, createScheduler } from './scheduler.js';
import type {
  EffectDefinition,
  EffectEvents,
  EffectInstance,
  EffectOptions,
  EffectsLayer,
  EffectsMetrics,
  FireEvent,
  FrameContext,
  MountHandle,
  MountOptions,
} from './types.js';

interface EnabledEffect {
  readonly def: EffectDefinition;
  instance: EffectInstance;
  opts: EffectOptions;
}

interface LayerState {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  quad: WebGLVertexArrayObject;
  atlas: WebGLTexture;
  cssVars: Record<string, string>;
  mapper: CoordinateMapper;
  host: HTMLElement;
  doc: Document;
  scheduler: Scheduler;
  hud: DebugHud | null;
  width: number;
  height: number;
  pixelRatio: number;
  getPixelRatio: () => number;
  reducedMotion: () => boolean;
  onContextLost: (e: Event) => void;
  onContextRestored: () => void;
  lastFrameMs: number;
  contextLost: boolean;
}

export function createEffectsLayer(): EffectsLayer {
  const registry = new Map<string, EffectDefinition>(Object.entries(DEFAULT_EFFECTS));
  const enabled = new Map<string, EnabledEffect>();
  const itemIndex = new Map<string, HitmapItem>();
  let hitmap: Hitmap | null = null;
  let state: LayerState | null = null;
  let debug = false;

  let hoveredId: string | null = null;
  let focusedId: string | null = null;
  let pointer: Point | null = null;
  let caretAt: Point | null = null;
  let caretHeight = 16;
  let drawCalls = 0;

  function rebuildItemIndex() {
    itemIndex.clear();
    if (!hitmap) return;
    for (const item of hitmap.items) itemIndex.set(item.id, item);
  }

  function frameContext(time: number, dt: number, reducedMotion: boolean): FrameContext {
    const s = state!;
    return {
      time,
      dt,
      pixelRatio: s.pixelRatio,
      viewport: { width: s.width, height: s.height },
      pointer,
      reducedMotion,
      hitmap,
      mapper: s.mapper,
      hoveredId,
      focusedId,
      caret: { at: caretAt, height: caretHeight },
      itemById: (id) => itemIndex.get(id) ?? null,
      recordDraw: (count = 1) => {
        drawCalls += count;
      },
    };
  }

  function tick({ time, dt, reducedMotion }: { time: number; dt: number; reducedMotion: boolean }) {
    const s = state;
    if (!s || s.contextLost) return;
    const t0 =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const nextPr = s.getPixelRatio();
    if (nextPr !== s.pixelRatio) {
      s.pixelRatio = nextPr;
      resize(s.width, s.height);
    }
    const gl = s.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawCalls = 0;
    gl.bindVertexArray(s.quad);
    const ctx = frameContext(time, dt, reducedMotion);
    for (const eff of enabled.values()) {
      if (reducedMotion && eff.def === DEFAULT_EFFECTS['cursorTrail']) continue;
      eff.instance.render(ctx);
    }
    gl.bindVertexArray(null);
    if (debug && s.hud) s.hud.render(s.mapper, s.scheduler.fps, drawCalls, s.pixelRatio);
    const t1 =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    s.lastFrameMs = t1 - t0;
    if (s.hud) s.hud.recordFrame(s.lastFrameMs);
  }

  function resize(width: number, height: number) {
    const s = state;
    if (!s) return;
    s.width = width;
    s.height = height;
    s.canvas.width = Math.max(1, Math.round(width * s.pixelRatio));
    s.canvas.height = Math.max(1, Math.round(height * s.pixelRatio));
    s.canvas.style.width = `${width}px`;
    s.canvas.style.height = `${height}px`;
    if (s.hud) s.hud.resize(width, height, s.pixelRatio);
  }

  function ensureEffectInstance(name: string, opts: EffectOptions | undefined): EnabledEffect {
    const existing = enabled.get(name);
    if (existing) {
      if (opts) {
        existing.instance.setOptions?.(opts);
        existing.opts = opts;
      }
      return existing;
    }
    const def = registry.get(name);
    if (!def) throw new Error(`[effects] unknown effect: ${name}`);
    const s = state;
    if (!s) throw new Error('[effects] cannot enable before mount');
    const instance = def.init({
      gl: s.gl,
      fullscreenQuad: s.quad,
      scratch: new Float32Array(64),
      cssVars: s.cssVars,
    });
    if (opts) instance.setOptions?.(opts);
    const entry: EnabledEffect = { def, instance, opts: opts ?? {} };
    enabled.set(name, entry);
    return entry;
  }

  const layer: EffectsLayer = {
    mount(host, mapper, opts: MountOptions = {}) {
      if (state) throw new Error('[effects] already mounted');
      const doc = opts.document ?? host.ownerDocument ?? document;
      const canvas = doc.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;';
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(canvas);

      const gl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      }) as WebGL2RenderingContext | null;
      if (!gl) {
        host.removeChild(canvas);
        throw new Error('[effects] WebGL2 unavailable');
      }

      if (opts.webgpu) {
        const nav: unknown = globalThis.navigator;
        const hasGpu =
          typeof nav === 'object' && nav !== null && 'gpu' in (nav as Record<string, unknown>);
        if (!hasGpu) {
          // biome-ignore lint/suspicious/noConsoleLog: intentional one-line diagnostic
          console.warn(
            '[sketchapedia/effects] webgpu requested but navigator.gpu absent; using WebGL2',
          );
        }
      }

      const cssVars = resolveCssVars(host);
      const quad = createFullscreenQuad(gl);
      const atlas = createSpriteAtlas(gl);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas);

      const getPr =
        opts.getPixelRatio ?? (() => (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
      const reducedMotion =
        opts.reducedMotion ??
        (() =>
          typeof matchMedia === 'function'
            ? matchMedia('(prefers-reduced-motion: reduce)').matches
            : false);

      const s: LayerState = {
        canvas,
        gl,
        quad,
        atlas,
        cssVars,
        mapper,
        host,
        doc,
        scheduler: undefined as unknown as Scheduler,
        hud: null,
        width: mapper.viewport.width,
        height: mapper.viewport.height,
        pixelRatio: getPr(),
        getPixelRatio: getPr,
        reducedMotion,
        onContextLost: (e: Event) => {
          e.preventDefault();
          s.contextLost = true;
          s.scheduler.pause();
        },
        onContextRestored: () => {
          s.contextLost = false;
          for (const [name, entry] of enabled) {
            entry.instance.dispose();
            const freshQuad = createFullscreenQuad(gl);
            s.quad = freshQuad;
            entry.instance = entry.def.init({
              gl,
              fullscreenQuad: freshQuad,
              scratch: new Float32Array(64),
              cssVars: s.cssVars,
            });
            if (entry.opts) entry.instance.setOptions?.(entry.opts);
            enabled.set(name, entry);
          }
          s.scheduler.resume();
        },
        lastFrameMs: 0,
        contextLost: false,
      };
      canvas.addEventListener('webglcontextlost', s.onContextLost as EventListener);
      canvas.addEventListener('webglcontextrestored', s.onContextRestored);
      state = s;

      if (opts.hitmap) {
        hitmap = opts.hitmap;
        rebuildItemIndex();
      }
      resize(s.width, s.height);

      const scheduler = createScheduler(tick, { document: doc, reducedMotion });
      s.scheduler = scheduler;

      const defaults = opts.defaultEffects ?? [{ name: 'focusRing' }, { name: 'hoverGlow' }];
      for (const d of defaults) layer.enable(d.name, d.opts);

      scheduler.start();

      const handle: MountHandle = {
        setEvent<K extends keyof EffectEvents>(kind: K, value: EffectEvents[K]) {
          setEvent(kind, value);
        },
        resize: (w, h) => resize(w, h),
        dispose() {
          scheduler.dispose();
          for (const entry of enabled.values()) entry.instance.dispose();
          enabled.clear();
          if (s.hud) s.hud.dispose();
          canvas.removeEventListener('webglcontextlost', s.onContextLost as EventListener);
          canvas.removeEventListener('webglcontextrestored', s.onContextRestored);
          gl.deleteVertexArray(quad);
          gl.deleteTexture(atlas);
          const ext = gl.getExtension('WEBGL_lose_context');
          ext?.loseContext();
          if (canvas.parentElement === host) host.removeChild(canvas);
          state = null;
          hitmap = null;
          itemIndex.clear();
        },
      };
      return handle;
    },

    setHitmap(next) {
      hitmap = next;
      rebuildItemIndex();
      if (state?.hud) state.hud.setHitmap(next);
    },

    enable(name, opts) {
      ensureEffectInstance(String(name), opts);
    },

    disable(name) {
      const entry = enabled.get(String(name));
      if (!entry) return;
      entry.instance.dispose();
      enabled.delete(String(name));
    },

    fire(name, event: FireEvent) {
      const entry = enabled.get(String(name));
      entry?.instance.fire?.(event);
    },

    register(name, effect) {
      if (!effect.vertex || !effect.fragment) {
        throw new Error(`[effects] register(${name}): vertex and fragment sources are required`);
      }
      registry.set(name, effect);
    },

    setDebug(enabledFlag) {
      debug = enabledFlag;
      const s = state;
      if (!s) return;
      if (enabledFlag && !s.hud) {
        s.hud = createDebugHud(s.host, s.doc);
        s.hud.resize(s.width, s.height, s.pixelRatio);
        s.hud.setHitmap(hitmap);
      } else if (!enabledFlag && s.hud) {
        s.hud.dispose();
        s.hud = null;
      }
    },

    get metrics(): EffectsMetrics {
      const s = state;
      if (!s) {
        return { fps: 0, drawCalls: 0, gpuTimeMs: 0, frameCount: 0, paused: true };
      }
      return {
        fps: s.scheduler.fps,
        drawCalls,
        gpuTimeMs: 0,
        frameCount: s.scheduler.frameCount,
        paused: s.scheduler.paused || s.contextLost,
      };
    },
  };

  function setEvent<K extends keyof EffectEvents>(kind: K, value: EffectEvents[K]): void {
    switch (kind) {
      case 'hover': {
        const v = value as EffectEvents['hover'];
        hoveredId = v.id;
        if (v.at) pointer = v.at;
        break;
      }
      case 'focus': {
        const v = value as EffectEvents['focus'];
        focusedId = v.id;
        break;
      }
      case 'pointer': {
        const v = value as EffectEvents['pointer'];
        pointer = v.at;
        break;
      }
      case 'scroll': {
        const v = value as EffectEvents['scroll'];
        const par = enabled.get('parallax');
        par?.instance.setOptions?.({ scrollY: v.y });
        break;
      }
      case 'caret': {
        const v = value as EffectEvents['caret'];
        caretAt = v.at;
        caretHeight = v.height;
        break;
      }
    }
  }

  return layer;
}

function resolveCssVars(host: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof getComputedStyle !== 'function') return out;
  const style = getComputedStyle(host);
  const names = [
    '--sk-focus-ring-color',
    '--sk-hover-glow-color',
    '--sk-cursor-trail-color',
    '--sk-click-burst-color',
    '--sk-parallax-color',
    '--sk-typing-indicator-color',
  ];
  for (const n of names) {
    const v = style.getPropertyValue(n).trim();
    if (v) out[n] = v;
  }
  return out;
}
