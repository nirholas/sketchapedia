// Pixel-layer factories. Each returns { element, viewBox, destroy() }.
// The pixel layer is the "what the user sees"; the overlay rides on top.
// New strategies (image-sequence, video, WebGL, streamed frames) plug in here
// without touching the overlay or the core.

export function svgLayer({ markup, viewBox }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ska-pixel ska-pixel-svg';
  wrapper.innerHTML = markup;
  const svg = wrapper.querySelector('svg');
  if (svg) {
    if (!svg.getAttribute('viewBox')) {
      svg.setAttribute('viewBox', `0 0 ${viewBox.w} ${viewBox.h}`);
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, {
      width: '100%',
      height: '100%',
      display: 'block'
    });
  }
  return {
    element: wrapper,
    viewBox,
    destroy() { wrapper.remove(); }
  };
}

export function imageLayer({ src, viewBox, alt = '' }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ska-pixel ska-pixel-image';
  const img = new Image();
  img.src = src;
  img.alt = alt;
  img.setAttribute('aria-hidden', alt ? 'false' : 'true');
  Object.assign(img.style, {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block'
  });
  wrapper.appendChild(img);
  return {
    element: wrapper,
    viewBox,
    destroy() { wrapper.remove(); }
  };
}

export function createPixelLayer(pixel) {
  switch (pixel.kind) {
    case 'svg':   return svgLayer(pixel);
    case 'image': return imageLayer(pixel);
    default:
      throw new Error('sketchapedia: unknown pixel kind "' + pixel.kind + '"');
  }
}
