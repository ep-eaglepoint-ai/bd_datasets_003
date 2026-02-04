
/**
 * Calculates the bounding box of a set of local segments.
 * Segments: [{x1,y1,x2,y2}, ...]
 */
export const calculateBounds = (segments) => {
  if (!segments || segments.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  segments.forEach(s => {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  });

  return {
    minX, maxX, minY, maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};

/**
 * Calculates scale and scale offsets to fit data into canvas with padding.
 * Canvas Y is inverted relative to Cartesian Y.
 */
export const calculateTransform = (bounds, canvasWidth, canvasHeight, padding = 20) => {
  if (bounds.width === 0 && bounds.height === 0) return { scale: 1, offsetX: 0, offsetY: 0 };

  const scaleX = (canvasWidth - 2 * padding) / (bounds.width || 1);
  const scaleY = (canvasHeight - 2 * padding) / (bounds.height || 1);
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (canvasWidth - bounds.width * scale) / 2 - bounds.minX * scale;
  const offsetY = (canvasHeight - bounds.height * scale) / 2 - bounds.minY * scale;

  return { scale, offsetX, offsetY };
};

/**
 * Transforms a Cartesian Point (x,y) to Screen Coordinates (screenX, screenY).
 * Performs Y-flip: 0,0 top-left vs bottom-left.
 */
export const toScreen = (x, y, scale, offsetX, offsetY, canvasHeight) => {
  return {
    x: x * scale + offsetX,
    y: canvasHeight - (y * scale + offsetY)
  };
};
