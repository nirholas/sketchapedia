// Demo driver: mounts the hybrid UI and owns the "backend" that resolves
// intents into the next state. In production this handler lives on a GPU
// service behind a WebSocket; here it runs in-process so the demo works
// offline.

import { mount, localTransport } from '../src/sketchapedia.js';
import { stateDef } from './states.js';

const GUEST_MIN = 1;
const GUEST_MAX = 10;

const transport = localTransport(async (intent, ctx) => {
  switch (intent.action) {
    case 'guests.inc': {
      const next = Math.min(GUEST_MAX, (ctx.values['stepper.guests'] ?? 2) + 1);
      return { patches: { 'stepper.guests': next }, nextState: 'booking' };
    }
    case 'guests.dec': {
      const next = Math.max(GUEST_MIN, (ctx.values['stepper.guests'] ?? 2) - 1);
      return { patches: { 'stepper.guests': next }, nextState: 'booking' };
    }
    case 'time.select':
      return { patches: { 'btn.time': intent.payload.time }, nextState: 'booking' };
    case 'date.set':
      // Input value is already merged into ctx.values by the core; no DOM
      // touch needed — the focused input keeps cursor position.
      return null;
    case 'reservation.confirm':
      if (!ctx.values['btn.time']) {
        return { announce: 'Select a seating time first.' };
      }
      return { nextState: 'confirmed', announce: 'Reservation confirmed.' };
    case 'reservation.again':
      return { nextState: 'booking' };
    default:
      return null;
  }
});

const app = mount({
  el: '#app',
  initialState: 'booking',
  initialValues: {
    'stepper.guests': 2,
    'input.date': 'Thursday, 27 March 2026'
  },
  states: stateDef,
  transport,
  onIntent(intent) {
    const feed = document.getElementById('intent-feed');
    if (!feed) return;
    const li = document.createElement('li');
    li.textContent = intent.type + ' → ' + intent.action +
      (intent.value !== undefined ? ' (' + intent.value + ')' : '') +
      (intent.payload && Object.keys(intent.payload).length
        ? ' ' + JSON.stringify(intent.payload) : '');
    feed.prepend(li);
    while (feed.children.length > 8) feed.lastChild.remove();
  }
});

window.__sketchapedia = app;
