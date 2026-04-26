// Geometry helpers for logical regions. Shapes live in the pixel layer's
// viewBox coordinate space; the overlay scales them to the rendered stage.

export function rectBounds(shape) {
  switch (shape.type) {
    case 'rect':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    case 'polygon': {
      const xs = shape.points.map(p => p[0]);
      const ys = shape.points.map(p => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    default:
      throw new Error('sketchapedia: unknown shape type "' + shape.type + '"');
  }
}

export function percentBox(bounds, viewBox) {
  return {
    left: (bounds.x / viewBox.w) * 100 + '%',
    top: (bounds.y / viewBox.h) * 100 + '%',
    width: (bounds.w / viewBox.w) * 100 + '%',
    height: (bounds.h / viewBox.h) * 100 + '%'
  };
}
