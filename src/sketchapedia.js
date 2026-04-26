// Sketchapedia SDK public entrypoint.
//
// Hybrid generative-logical UI: a generative pixel layer (image, SVG, video,
// or frame sequence) paired with an invisible semantic DOM overlay. The core
// mounts them together; the transport owns the intent-to-next-state roundtrip.

export { mount } from './core.js';
export { localTransport, websocketTransport } from './transport.js';
export { createPixelLayer, svgLayer, imageLayer } from './renderer.js';
export { rectBounds, percentBox } from './regions.js';
