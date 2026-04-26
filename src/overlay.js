// Logical overlay: an invisible, semantic DOM layered over the pixel layer.
// Every interactive region becomes a real element (button, input, range) with
// ARIA so screen readers and keyboards work. This is the escape hatch that
// makes the generative pixel layer practical today.

import { rectBounds, percentBox } from './regions.js';

export function createOverlay({ regions, viewBox, dispatch, values, onValueChange }) {
  const element = document.createElement('div');
  element.className = 'ska-overlay';
  element.setAttribute('role', 'application');
  Object.assign(element.style, {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none'
  });

  const nodes = regions.map(region => {
    const node = buildRegion(region, values?.[region.id]);
    wireRegion(node, region, dispatch, onValueChange);
    element.appendChild(node.root);
    return node;
  });

  return {
    element,
    destroy() { element.remove(); },
    setValue(regionId, value) {
      const node = nodes.find(n => n.region.id === regionId);
      node?.setValue?.(value);
    },
    refreshValues(next) {
      for (const n of nodes) {
        const v = next?.[n.region.id];
        if (v !== undefined) n.setValue?.(v);
      }
    }
  };
}

function buildRegion(region, initialValue) {
  const bounds = rectBounds(region.shape);
  const root = document.createElement('div');
  root.className = 'ska-region ska-region-' + region.intent.type;
  root.dataset.regionId = region.id;
  const pct = percentBox(bounds, { w: region.__viewBox?.w ?? 1, h: region.__viewBox?.h ?? 1 });
  // Positioned by the layout pass below using real viewBox; set a sane default:
  Object.assign(root.style, {
    position: 'absolute',
    pointerEvents: 'auto',
    left: pct.left,
    top: pct.top,
    width: pct.width,
    height: pct.height
  });

  let trigger;
  let setValue;

  switch (region.intent.type) {
    case 'click':
      trigger = buildClickTrigger(region.intent);
      break;
    case 'input': {
      const built = buildInputTrigger(region.intent, initialValue);
      trigger = built.el;
      setValue = v => { built.el.value = v ?? ''; };
      break;
    }
    case 'scrub': {
      const built = buildScrubTrigger(region.intent, initialValue);
      trigger = built.el;
      setValue = v => { built.el.value = String(v); };
      break;
    }
    case 'toggle': {
      const built = buildToggleTrigger(region.intent, initialValue);
      trigger = built.el;
      setValue = v => { built.el.setAttribute('aria-pressed', v ? 'true' : 'false'); };
      break;
    }
    default:
      throw new Error('sketchapedia: unknown intent type "' + region.intent.type + '"');
  }

  root.appendChild(trigger);
  return { region, root, bounds, trigger, setValue };
}

function buildClickTrigger(intent) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ska-trigger ska-trigger-click';
  btn.setAttribute('aria-label', intent.label ?? intent.action ?? 'action');
  Object.assign(btn.style, {
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: '0',
    padding: '0',
    margin: '0',
    color: 'transparent',
    cursor: 'pointer',
    font: 'inherit'
  });
  return btn;
}

function buildInputTrigger(intent, initialValue) {
  const el = document.createElement('input');
  el.type = intent.inputType ?? 'text';
  el.className = 'ska-trigger ska-trigger-input';
  el.setAttribute('aria-label', intent.label ?? 'input');
  if (intent.placeholder) el.placeholder = intent.placeholder;
  if (intent.autocomplete) el.autocomplete = intent.autocomplete;
  el.value = initialValue ?? '';
  Object.assign(el.style, {
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: '0',
    padding: intent.padding ?? '0 0.5em',
    margin: '0',
    font: intent.font ?? 'inherit',
    color: intent.color ?? 'currentColor',
    caretColor: intent.caretColor ?? 'currentColor',
    textAlign: intent.align ?? 'left',
    outline: 'none'
  });
  return { el };
}

function buildScrubTrigger(intent, initialValue) {
  const el = document.createElement('input');
  el.type = 'range';
  el.className = 'ska-trigger ska-trigger-scrub';
  el.min = String(intent.min ?? 0);
  el.max = String(intent.max ?? 100);
  el.step = String(intent.step ?? 1);
  el.value = String(initialValue ?? intent.value ?? intent.min ?? 0);
  el.setAttribute('aria-label', intent.label ?? 'scrub');
  Object.assign(el.style, {
    width: '100%',
    height: '100%',
    margin: '0',
    opacity: '0',
    cursor: 'ew-resize'
  });
  return { el };
}

function buildToggleTrigger(intent, initialValue) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'ska-trigger ska-trigger-toggle';
  el.setAttribute('role', 'switch');
  el.setAttribute('aria-label', intent.label ?? intent.action ?? 'toggle');
  el.setAttribute('aria-pressed', initialValue ? 'true' : 'false');
  Object.assign(el.style, {
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: '0',
    padding: '0',
    margin: '0',
    color: 'transparent',
    cursor: 'pointer',
    font: 'inherit'
  });
  return { el };
}

function wireRegion(node, region, dispatch, onValueChange) {
  const { trigger, region: r } = node;
  const intent = region.intent;

  switch (intent.type) {
    case 'click':
      trigger.addEventListener('click', e => {
        e.preventDefault();
        dispatch({
          type: 'click',
          regionId: r.id,
          action: intent.action,
          payload: intent.payload ?? {}
        });
      });
      break;

    case 'input':
      trigger.addEventListener('input', e => {
        const value = e.target.value;
        onValueChange?.(r.id, value);
        dispatch({
          type: 'input',
          regionId: r.id,
          action: intent.action ?? 'set',
          value
        });
      });
      trigger.addEventListener('change', e => {
        dispatch({
          type: 'commit',
          regionId: r.id,
          action: intent.commitAction ?? intent.action ?? 'commit',
          value: e.target.value
        });
      });
      break;

    case 'scrub':
      trigger.addEventListener('input', e => {
        const value = Number(e.target.value);
        onValueChange?.(r.id, value);
        dispatch({
          type: 'scrub',
          regionId: r.id,
          action: intent.action ?? 'scrub',
          value
        });
      });
      break;

    case 'toggle':
      trigger.addEventListener('click', () => {
        const next = trigger.getAttribute('aria-pressed') !== 'true';
        trigger.setAttribute('aria-pressed', next ? 'true' : 'false');
        onValueChange?.(r.id, next);
        dispatch({
          type: 'toggle',
          regionId: r.id,
          action: intent.action ?? 'toggle',
          value: next
        });
      });
      break;
  }
}
