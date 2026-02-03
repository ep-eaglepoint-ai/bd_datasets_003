/**
 * Utility functions for G-Code visualization and processing.
 * These are extracted from the React components for testability.
 */

/**
 * Parse a G-code line and extract command type and coordinates.
 * @param {string} line - G-code line to parse
 * @returns {Object} Parsed command with type and coordinates
 */
export function parseGCodeLine(line) {
  const result = {
    command: null,
    x: null,
    y: null,
    isTravel: false, // G0
    isCut: false, // G1
  };

  if (!line || typeof line !== "string") {
    return result;
  }

  const parts = line.trim().split(/\s+/);
  if (parts.length === 0) {
    return result;
  }

  const cmd = parts[0];
  result.command = cmd;

  if (cmd.startsWith("G0")) {
    result.isTravel = true;
  } else if (cmd.startsWith("G1")) {
    result.isCut = true;
  }

  for (const part of parts) {
    if (part.startsWith("X")) {
      result.x = parseFloat(part.substring(1));
    } else if (part.startsWith("Y")) {
      result.y = parseFloat(part.substring(1));
    }
  }

  return result;
}

/**
 * Get line style based on G-code command type.
 * Req 5: G0 (Travel) = Faint blue dashed, G1 (Cut) = Red solid
 * @param {Object} parsed - Parsed G-code command
 * @returns {Object} Style object with color, dash pattern, and alpha
 */
export function getLineStyle(parsed) {
  if (parsed.isTravel) {
    return {
      color: "#38bdf8", // Light blue
      dash: [5, 5], // Dashed
      alpha: 0.5, // Faint
    };
  } else if (parsed.isCut) {
    return {
      color: "#ef4444", // Red
      dash: [], // Solid
      alpha: 1.0, // Full opacity
    };
  }
  return {
    color: "#888888",
    dash: [],
    alpha: 1.0,
  };
}

/**
 * Calculate bounding box from segments.
 * Req 9: Calculate total width/height of design to center it on canvas.
 * @param {Array} segments - Array of segment objects with x1, y1, x2, y2
 * @returns {Object} Bounding box with minX, maxX, minY, maxY, width, height
 */
export function calculateBounds(segments) {
  if (!segments || segments.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const seg of segments) {
    minX = Math.min(minX, seg.x1, seg.x2);
    maxX = Math.max(maxX, seg.x1, seg.x2);
    minY = Math.min(minY, seg.y1, seg.y2);
    maxY = Math.max(maxY, seg.y1, seg.y2);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Create a coordinate transformer for converting machine coords to screen coords.
 * Req 4: Handle Y-axis inversion (machine Y up, screen Y down).
 * Req 9: Center design on canvas.
 * @param {Object} bounds - Bounding box from calculateBounds
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} padding - Padding around the design
 * @returns {Function} Transform function (x, y) => {x, y}
 */
export function createCoordinateTransformer(
  bounds,
  canvasWidth,
  canvasHeight,
  padding = 20,
) {
  const { minX, minY, width, height } = bounds;

  // Calculate scale to fit design in canvas with padding
  const scaleX = (canvasWidth - 2 * padding) / (width || 1);
  const scaleY = (canvasHeight - 2 * padding) / (height || 1);
  const scale = Math.min(scaleX, scaleY);

  // Calculate offsets for centering
  const offsetX = (canvasWidth - width * scale) / 2 - minX * scale;
  const offsetY = (canvasHeight - height * scale) / 2 - minY * scale;

  /**
   * Transform machine coordinates to screen coordinates.
   * Req 4: Y-axis inversion - machine (0,0) at bottom-left, screen (0,0) at top-left
   */
  return function toScreenCoords(x, y) {
    const screenX = x * scale + offsetX;
    // Y-axis inversion: flip the Y coordinate
    const screenY = canvasHeight - (y * scale + offsetY);
    return { x: screenX, y: screenY };
  };
}

/**
 * Calculate estimated job time from G-code.
 * @param {Array} gcodeLines - Array of G-code lines
 * @param {number} feedRate - Default feed rate in mm/min
 * @param {number} rapidRate - Rapid travel rate in mm/min
 * @returns {number} Estimated time in seconds
 */
export function calculateJobTime(
  gcodeLines,
  feedRate = 1000,
  rapidRate = 5000,
) {
  let time = 0;
  let curX = 0;
  let curY = 0;
  let feed = feedRate;

  for (const line of gcodeLines) {
    if (!line || typeof line !== "string") continue;

    // Handle standalone feed rate command
    if (line.startsWith("F")) {
      feed = parseFloat(line.substring(1));
      continue;
    }

    const parts = line.split(/\s+/);
    let newX = curX;
    let newY = curY;
    let isRapid = false;

    for (const part of parts) {
      if (part.startsWith("X")) {
        newX = parseFloat(part.substring(1));
      } else if (part.startsWith("Y")) {
        newY = parseFloat(part.substring(1));
      } else if (part.startsWith("F")) {
        feed = parseFloat(part.substring(1));
      }
    }

    if (line.startsWith("G0")) {
      isRapid = true;
    }

    // Calculate distance
    const dist = Math.sqrt((newX - curX) ** 2 + (newY - curY) ** 2);

    // Calculate time (rate is in mm/min, convert to seconds)
    const rate = isRapid ? rapidRate : feed;
    if (rate > 0) {
      time += dist / rate;
    }

    curX = newX;
    curY = newY;
  }

  return time * 60; // Convert minutes to seconds
}

/**
 * Valid status values for the UI.
 * Req 10: UI must show "Printing", "Idle", or "Paused"
 */
export const VALID_STATUSES = ["Disconnected", "Idle", "Printing", "Paused"];

/**
 * Parse a WebSocket status message.
 * @param {string} message - WebSocket message
 * @returns {string|null} Status value or null if not a status message
 */
export function parseStatusMessage(message) {
  if (message && message.startsWith("STATUS:")) {
    return message.split(": ")[1].trim();
  }
  return null;
}

/**
 * Get CSS class for status indicator.
 * @param {string} status - Current status
 * @returns {string} CSS class name
 */
export function getStatusClass(status) {
  return status.toLowerCase();
}
