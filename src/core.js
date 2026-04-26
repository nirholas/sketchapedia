// Sketchapedia core: mount a hybrid generative-logical UI into a host element.
// The pixel layer is whatever the renderer factory produces. The overlay is
// real DOM. State transitions are driven by intents resolved by the transport.

import { createPixelLayer } from './renderer.js';
import { createOverlay } from './overlay.js';

export function mount(opts) {
  const host = typeof opts.el === 'string'
    ? document.querySelector(opts.el)
    : opts.el;
  if (!host) throw new Error('sketchapedia: container not found: ' + opts.el);

  host.classList.add('ska-host');
  if (getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
  }

  const stage = document.createElement('div');
  stage.className = 'ska-stage';
  Object.assign(stage.style, {
    position: 'relative',
    width: '100%',
    overflow: 'hidden'
  });
  host.appendChild(stage);

  const liveRegion = document.createElement('div');
  liveRegion.className = 'ska-live';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  Object.assign(liveRegion.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap'
  });
  host.appendChild(liveRegion);

  const context = {
    values: { ...(opts.initialValues ?? {}) },
    announce(msg) { liveRegion.textContent = msg; }
  };

  let current = null;
  let renderToken = 0;

  async function resolveState(stateId) {
    if (typeof opts.states === 'function') return opts.states(stateId, context);
    const def = opts.states[stateId];
    return typeof def === 'function' ? def(context) : def;
  }

  async function render(stateId, reason) {
    const token = ++renderToken;
    const def = await resolveState(stateId);
    if (token !== renderToken) return;
    if (!def) throw new Error('sketchapedia: unknown state "' + stateId + '"');

    stage.style.aspectRatio = def.viewBox.w + ' / ' + def.viewBox.h;

    const pixel = createPixelLayer(def.pixel);
    Object.assign(pixel.element.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%'
    });

    const overlay = createOverlay({
      regions: (def.regions ?? []).map(r => ({ ...r, __viewBox: def.viewBox })),
      viewBox: def.viewBox,
      values: context.values,
      dispatch: intent => handleIntent(intent, stateId),
      onValueChange: (regionId, value) => {
        context.values[regionId] = value;
      }
    });

    // Same-state refresh swaps instantly to avoid flicker on every keystroke/
    // click that only mutates the pixel layer. Cross-state transitions fade.
    const sameState = current && current.stateId === stateId;
    const fadeMs = sameState ? 0 : (def.transition?.ms ?? 250);

    const scene = document.createElement('div');
    scene.className = 'ska-scene';
    Object.assign(scene.style, {
      position: 'absolute',
      inset: '0',
      opacity: fadeMs === 0 ? '1' : '0',
      transition: fadeMs > 0 ? fadeMs + 'ms ease opacity' : 'none'
    });
    scene.appendChild(pixel.element);
    scene.appendChild(overlay.element);
    stage.appendChild(scene);

    if (fadeMs > 0) {
      scene.getBoundingClientRect();
      scene.style.opacity = '1';
    }

    const prev = current;
    current = { stateId, scene, pixel, overlay, def };

    if (def.announce && !sameState) context.announce(def.announce);

    if (prev) {
      if (fadeMs === 0) {
        prev.pixel.destroy();
        prev.overlay.destroy();
        prev.scene.remove();
      } else {
        prev.scene.style.opacity = '0';
        setTimeout(() => {
          prev.pixel.destroy();
          prev.overlay.destroy();
          prev.scene.remove();
        }, fadeMs + 50);
      }
    }

    opts.onStateChange?.(stateId, reason, context);
  }

  async function handleIntent(intent, fromStateId) {
    const full = { ...intent, fromState: fromStateId, at: Date.now() };

    if (intent.type === 'input' || intent.type === 'scrub' || intent.type === 'toggle') {
      context.values[intent.regionId] = intent.value;
    }

    opts.onIntent?.(full, context);

    const result = await opts.transport.dispatch(full, context);
    if (!result) return;

    if (result.values) {
      Object.assign(context.values, result.values);
      current?.overlay.refreshValues(context.values);
    }
    if (result.patches) {
      for (const [regionId, value] of Object.entries(result.patches)) {
        context.values[regionId] = value;
        current?.overlay.setValue(regionId, value);
      }
    }
    if (result.announce) context.announce(result.announce);
    if (result.nextState) {
      await render(result.nextState, full);
    }
  }

  render(opts.initialState, { type: 'init' });

  return {
    get state() { return current?.stateId; },
    get values() { return { ...context.values }; },
    dispatch: (intent) => handleIntent(intent, current?.stateId),
    goto: (stateId) => render(stateId, { type: 'goto' }),
    destroy() {
      renderToken++;
      if (current) {
        current.pixel.destroy();
        current.overlay.destroy();
        current.scene.remove();
      }
      stage.remove();
      liveRegion.remove();
      opts.transport.close?.();
    }
  };
}
