// Demo state definitions for the Sketchapedia hybrid UI: a painted
// reservation flow for Le Jules Verne. Each state supplies a generative-
// style SVG pixel layer plus a logical region map in the same coordinate
// space. The transport (in app.js) is the "backend" that resolves intents
// into the next state.

const VIEWBOX = { w: 800, h: 560 };

const ROUGH_FILTER = `
  <defs>
    <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="4"/>
      <feDisplacementMap in="SourceGraphic" scale="2.2"/>
    </filter>
    <filter id="paper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="9"/>
      <feColorMatrix values="0 0 0 0 0.94
                             0 0 0 0 0.91
                             0 0 0 0 0.84
                             0 0 0 0.08 0"/>
    </filter>
    <pattern id="grain" x="0" y="0" width="100%" height="100%" patternUnits="userSpaceOnUse">
      <rect width="100%" height="100%" filter="url(#paper)"/>
    </pattern>
  </defs>
`;

const PALETTE = {
  paper: '#f4ead6',
  ink:   '#2a2018',
  ember: '#c8532a',
  leaf:  '#5c7a3a',
  sky:   '#6c92b4',
  gold:  '#c9a24a',
  mute:  '#8d8370'
};

function paperBackground() {
  return `
    <rect width="${VIEWBOX.w}" height="${VIEWBOX.h}" fill="${PALETTE.paper}"/>
    <rect width="${VIEWBOX.w}" height="${VIEWBOX.h}" fill="url(#grain)"/>
  `;
}

// ------------ State: booking ------------

function bookingMarkup(values) {
  const selected = values['btn.time'];
  const timeSlots = [
    { id: '18:30', x: 90,  label: '18:30' },
    { id: '19:00', x: 270, label: '19:00' },
    { id: '19:30', x: 450, label: '19:30' },
    { id: '20:00', x: 630, label: '20:00' }
  ];

  const slotSvg = timeSlots.map(s => {
    const isSel = s.id === selected;
    const fill = isSel ? PALETTE.ember : 'transparent';
    const stroke = isSel ? PALETTE.ember : PALETTE.ink;
    const text  = isSel ? PALETTE.paper : PALETTE.ink;
    return `
      <g filter="url(#rough)">
        <rect x="${s.x}" y="340" width="130" height="54" rx="6"
              fill="${fill}" stroke="${stroke}" stroke-width="2.2"/>
        <text x="${s.x + 65}" y="374" text-anchor="middle"
              font-family="Georgia, serif" font-size="22" font-style="italic"
              fill="${text}">${s.label}</text>
      </g>`;
  }).join('');

  const guests = values['stepper.guests'] ?? 2;
  const canConfirm = !!selected;
  const confirmFill = canConfirm ? PALETTE.ink : 'transparent';
  const confirmText = canConfirm ? PALETTE.paper : PALETTE.mute;
  const confirmStroke = canConfirm ? PALETTE.ink : PALETTE.mute;

  return `
    <svg xmlns="http://www.w3.org/2000/svg">
      ${ROUGH_FILTER}
      ${paperBackground()}

      <g filter="url(#rough)">
        <path d="M 60 80 Q 400 60 740 82" stroke="${PALETTE.gold}" stroke-width="2" fill="none"/>
        <text x="60" y="62" font-family="Georgia, serif" font-size="16"
              fill="${PALETTE.mute}" letter-spacing="6">PARIS · TOUR EIFFEL</text>
        <text x="60" y="140" font-family="Georgia, serif" font-size="48"
              font-style="italic" fill="${PALETTE.ink}">Le Jules Verne</text>
        <text x="60" y="172" font-family="Georgia, serif" font-size="18"
              fill="${PALETTE.mute}">Reserve a table · Second floor · 125 m above the Seine</text>
      </g>

      <g filter="url(#rough)">
        <text x="60" y="232" font-family="Georgia, serif" font-size="14"
              fill="${PALETTE.mute}" letter-spacing="3">GUESTS</text>
        <rect x="60" y="244" width="60" height="60" rx="30"
              fill="transparent" stroke="${PALETTE.ink}" stroke-width="2"/>
        <text x="90" y="286" text-anchor="middle" font-family="Georgia, serif"
              font-size="32" fill="${PALETTE.ink}">-</text>
        <text x="160" y="286" font-family="Georgia, serif" font-size="36"
              fill="${PALETTE.ink}">${guests}</text>
        <text x="160" y="306" font-family="Georgia, serif" font-size="14"
              fill="${PALETTE.mute}" font-style="italic">
              ${guests === 1 ? 'guest' : 'guests'}</text>
        <rect x="230" y="244" width="60" height="60" rx="30"
              fill="transparent" stroke="${PALETTE.ink}" stroke-width="2"/>
        <text x="260" y="286" text-anchor="middle" font-family="Georgia, serif"
              font-size="32" fill="${PALETTE.ink}">+</text>
      </g>

      <g filter="url(#rough)">
        <text x="340" y="232" font-family="Georgia, serif" font-size="14"
              fill="${PALETTE.mute}" letter-spacing="3">DATE</text>
        <rect x="340" y="244" width="400" height="60" rx="4"
              fill="transparent" stroke="${PALETTE.ink}" stroke-width="2"/>
      </g>

      <g filter="url(#rough)">
        <text x="60" y="330" font-family="Georgia, serif" font-size="14"
              fill="${PALETTE.mute}" letter-spacing="3">SEATING TIME</text>
      </g>
      ${slotSvg}

      <g filter="url(#rough)">
        <rect x="60" y="440" width="680" height="66" rx="6"
              fill="${confirmFill}" stroke="${confirmStroke}" stroke-width="2.5"/>
        <text x="400" y="482" text-anchor="middle" font-family="Georgia, serif"
              font-size="24" font-style="italic" fill="${confirmText}">
              Confirm reservation</text>
      </g>

      <g>
        <text x="60" y="538" font-family="Georgia, serif" font-size="13"
              fill="${PALETTE.mute}" font-style="italic">
              Rendered as pixels · interactions routed through the logical overlay</text>
      </g>
    </svg>
  `;
}

const BOOKING_REGIONS = [
  {
    id: 'stepper.guests.dec',
    shape: { type: 'rect', x: 60, y: 244, w: 60, h: 60 },
    intent: { type: 'click', action: 'guests.dec', label: 'Decrease guests' }
  },
  {
    id: 'stepper.guests.inc',
    shape: { type: 'rect', x: 230, y: 244, w: 60, h: 60 },
    intent: { type: 'click', action: 'guests.inc', label: 'Increase guests' }
  },
  {
    id: 'input.date',
    shape: { type: 'rect', x: 340, y: 244, w: 400, h: 60 },
    intent: {
      type: 'input',
      action: 'date.set',
      inputType: 'text',
      label: 'Reservation date',
      placeholder: 'Thursday, 27 March 2026',
      font: 'italic 20px Georgia, serif',
      color: '#2a2018',
      padding: '0 16px'
    }
  },
  {
    id: 'btn.time.1830',
    shape: { type: 'rect', x: 90,  y: 340, w: 130, h: 54 },
    intent: { type: 'click', action: 'time.select', payload: { time: '18:30' }, label: 'Select 18:30' }
  },
  {
    id: 'btn.time.1900',
    shape: { type: 'rect', x: 270, y: 340, w: 130, h: 54 },
    intent: { type: 'click', action: 'time.select', payload: { time: '19:00' }, label: 'Select 19:00' }
  },
  {
    id: 'btn.time.1930',
    shape: { type: 'rect', x: 450, y: 340, w: 130, h: 54 },
    intent: { type: 'click', action: 'time.select', payload: { time: '19:30' }, label: 'Select 19:30' }
  },
  {
    id: 'btn.time.2000',
    shape: { type: 'rect', x: 630, y: 340, w: 130, h: 54 },
    intent: { type: 'click', action: 'time.select', payload: { time: '20:00' }, label: 'Select 20:00' }
  },
  {
    id: 'btn.confirm',
    shape: { type: 'rect', x: 60, y: 440, w: 680, h: 66 },
    intent: { type: 'click', action: 'reservation.confirm', label: 'Confirm reservation' }
  }
];

// ------------ State: confirmed ------------

function confirmedMarkup(values) {
  const time = values['btn.time'] ?? '19:00';
  const guests = values['stepper.guests'] ?? 2;
  const date = values['input.date'] || 'Thursday, 27 March 2026';
  return `
    <svg xmlns="http://www.w3.org/2000/svg">
      ${ROUGH_FILTER}
      ${paperBackground()}

      <g filter="url(#rough)">
        <circle cx="400" cy="170" r="80" fill="transparent"
                stroke="${PALETTE.leaf}" stroke-width="3"/>
        <path d="M 360 170 L 390 200 L 445 145" fill="none"
              stroke="${PALETTE.leaf}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>

      <g filter="url(#rough)">
        <text x="400" y="300" text-anchor="middle" font-family="Georgia, serif"
              font-size="40" font-style="italic" fill="${PALETTE.ink}">
              Your table is reserved</text>
        <text x="400" y="340" text-anchor="middle" font-family="Georgia, serif"
              font-size="20" fill="${PALETTE.mute}">Le Jules Verne · ${date}</text>
        <text x="400" y="372" text-anchor="middle" font-family="Georgia, serif"
              font-size="22" fill="${PALETTE.ember}">
              ${time} · ${guests} ${guests === 1 ? 'guest' : 'guests'}</text>
      </g>

      <g filter="url(#rough)">
        <rect x="220" y="440" width="360" height="60" rx="6"
              fill="transparent" stroke="${PALETTE.ink}" stroke-width="2"/>
        <text x="400" y="478" text-anchor="middle" font-family="Georgia, serif"
              font-size="20" font-style="italic" fill="${PALETTE.ink}">
              Book another</text>
      </g>

      <g>
        <text x="400" y="538" text-anchor="middle" font-family="Georgia, serif"
              font-size="13" fill="${PALETTE.mute}" font-style="italic">
              No HTML form was used to render this page</text>
      </g>
    </svg>
  `;
}

const CONFIRMED_REGIONS = [
  {
    id: 'btn.again',
    shape: { type: 'rect', x: 220, y: 440, w: 360, h: 60 },
    intent: { type: 'click', action: 'reservation.again', label: 'Book another reservation' }
  }
];

// ------------ State registry ------------

export const VIEW_BOX = VIEWBOX;

export function stateDef(stateId, context) {
  switch (stateId) {
    case 'booking':
      return {
        viewBox: VIEWBOX,
        pixel: { kind: 'svg', markup: bookingMarkup(context.values), viewBox: VIEWBOX },
        regions: BOOKING_REGIONS,
        announce: 'Reservation form. Select guests, date, and seating time.'
      };
    case 'confirmed':
      return {
        viewBox: VIEWBOX,
        pixel: { kind: 'svg', markup: confirmedMarkup(context.values), viewBox: VIEWBOX },
        regions: CONFIRMED_REGIONS,
        announce: 'Reservation confirmed.'
      };
    default:
      throw new Error('Unknown demo state: ' + stateId);
  }
}
