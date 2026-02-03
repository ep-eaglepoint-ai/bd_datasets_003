/**
 * Tests for G-Code utility functions.
 * Tests requirements 4, 5, 9, 10 for the frontend.
 */

import { describe, it, expect } from "vitest";
import {
  parseGCodeLine,
  getLineStyle,
  calculateBounds,
  createCoordinateTransformer,
  calculateJobTime,
  VALID_STATUSES,
  parseStatusMessage,
  getStatusClass,
} from "./gcodeUtils.js";

describe("G-Code Parsing", () => {
  describe("parseGCodeLine", () => {
    it("should parse G0 (travel) command correctly", () => {
      const result = parseGCodeLine("G0 X100.5 Y200.25");

      expect(result.command).toBe("G0");
      expect(result.isTravel).toBe(true);
      expect(result.isCut).toBe(false);
      expect(result.x).toBe(100.5);
      expect(result.y).toBe(200.25);
    });

    it("should parse G1 (cut) command correctly", () => {
      const result = parseGCodeLine("G1 X50.0 Y75.5");

      expect(result.command).toBe("G1");
      expect(result.isTravel).toBe(false);
      expect(result.isCut).toBe(true);
      expect(result.x).toBe(50.0);
      expect(result.y).toBe(75.5);
    });

    it("should parse setup commands (G21, G90)", () => {
      const g21 = parseGCodeLine("G21");
      const g90 = parseGCodeLine("G90");

      expect(g21.command).toBe("G21");
      expect(g21.isTravel).toBe(false);
      expect(g21.isCut).toBe(false);

      expect(g90.command).toBe("G90");
    });

    it("should handle empty line", () => {
      const result = parseGCodeLine("");
      expect(result.command).toBe(null);
    });

    it("should handle null/undefined input", () => {
      expect(parseGCodeLine(null).command).toBe(null);
      expect(parseGCodeLine(undefined).command).toBe(null);
    });

    it("should parse coordinates with negative values", () => {
      const result = parseGCodeLine("G1 X-10.5 Y-20.25");
      expect(result.x).toBe(-10.5);
      expect(result.y).toBe(-20.25);
    });
  });
});

describe("Req 5: G0/G1 Line Styling", () => {
  describe("getLineStyle", () => {
    it("should return faint blue dashed style for G0 (travel)", () => {
      const parsed = parseGCodeLine("G0 X10 Y20");
      const style = getLineStyle(parsed);

      expect(style.color).toBe("#38bdf8"); // Light blue
      expect(style.dash).toEqual([5, 5]); // Dashed
      expect(style.alpha).toBe(0.5); // Faint
    });

    it("should return red solid style for G1 (cut)", () => {
      const parsed = parseGCodeLine("G1 X30 Y40");
      const style = getLineStyle(parsed);

      expect(style.color).toBe("#ef4444"); // Red
      expect(style.dash).toEqual([]); // Solid (no dash)
      expect(style.alpha).toBe(1.0); // Full opacity
    });

    it("should have different styles for G0 and G1", () => {
      const g0Style = getLineStyle(parseGCodeLine("G0 X10 Y10"));
      const g1Style = getLineStyle(parseGCodeLine("G1 X20 Y20"));

      expect(g0Style.color).not.toBe(g1Style.color);
      expect(g0Style.dash).not.toEqual(g1Style.dash);
    });

    it("should return default style for non-movement commands", () => {
      const parsed = parseGCodeLine("G21");
      const style = getLineStyle(parsed);

      expect(style.color).toBe("#888888");
      expect(style.dash).toEqual([]);
      expect(style.alpha).toBe(1.0);
    });
  });
});

describe("Req 9: Canvas Centering", () => {
  describe("calculateBounds", () => {
    it("should calculate bounding box dimensions correctly", () => {
      const segments = [
        { x1: 10, y1: 20, x2: 100, y2: 80 },
        { x1: 50, y1: 10, x2: 150, y2: 90 },
      ];

      const bounds = calculateBounds(segments);

      expect(bounds.minX).toBe(10);
      expect(bounds.maxX).toBe(150);
      expect(bounds.minY).toBe(10);
      expect(bounds.maxY).toBe(90);
      expect(bounds.width).toBe(140); // 150 - 10
      expect(bounds.height).toBe(80); // 90 - 10
    });

    it("should handle empty segments array", () => {
      const bounds = calculateBounds([]);

      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });

    it("should handle single segment", () => {
      const segments = [{ x1: 0, y1: 0, x2: 100, y2: 50 }];
      const bounds = calculateBounds(segments);

      expect(bounds.width).toBe(100);
      expect(bounds.height).toBe(50);
    });

    it("should handle segments with negative coordinates", () => {
      const segments = [{ x1: -50, y1: -30, x2: 50, y2: 30 }];
      const bounds = calculateBounds(segments);

      expect(bounds.minX).toBe(-50);
      expect(bounds.maxX).toBe(50);
      expect(bounds.width).toBe(100);
      expect(bounds.height).toBe(60);
    });
  });

  describe("createCoordinateTransformer - Centering", () => {
    it("should center design horizontally on canvas", () => {
      const segments = [{ x1: 0, y1: 0, x2: 100, y2: 100 }];
      const bounds = calculateBounds(segments);
      const transform = createCoordinateTransformer(bounds, 600, 400, 20);

      // Design center in machine coords
      const designCenterX = 50;
      const { x: screenX } = transform(designCenterX, 50);

      // Canvas center X
      const canvasCenterX = 600 / 2;

      // Should be centered (within small tolerance)
      expect(Math.abs(screenX - canvasCenterX)).toBeLessThan(1);
    });

    it("should center design vertically on canvas", () => {
      const segments = [{ x1: 0, y1: 0, x2: 100, y2: 100 }];
      const bounds = calculateBounds(segments);
      const transform = createCoordinateTransformer(bounds, 600, 400, 20);

      const designCenterY = 50;
      const { y: screenY } = transform(50, designCenterY);

      const canvasCenterY = 400 / 2;

      expect(Math.abs(screenY - canvasCenterY)).toBeLessThan(1);
    });

    it("should fit design within canvas bounds with padding", () => {
      const segments = [{ x1: 0, y1: 0, x2: 1000, y2: 800 }];
      const bounds = calculateBounds(segments);
      const padding = 20;
      const canvasWidth = 600;
      const canvasHeight = 400;
      const transform = createCoordinateTransformer(
        bounds,
        canvasWidth,
        canvasHeight,
        padding,
      );

      // Check all corners fit within padded area
      const corners = [
        [0, 0],
        [1000, 0],
        [0, 800],
        [1000, 800],
      ];

      for (const [mx, my] of corners) {
        const { x: sx, y: sy } = transform(mx, my);
        expect(sx).toBeGreaterThanOrEqual(padding);
        expect(sx).toBeLessThanOrEqual(canvasWidth - padding);
        expect(sy).toBeGreaterThanOrEqual(padding);
        expect(sy).toBeLessThanOrEqual(canvasHeight - padding);
      }
    });
  });
});

describe("Req 4: Y-Axis Inversion", () => {
  describe("createCoordinateTransformer - Y Flip", () => {
    it("should invert Y axis so higher machine Y = lower screen Y", () => {
      const segments = [{ x1: 0, y1: 0, x2: 100, y2: 100 }];
      const bounds = calculateBounds(segments);
      const transform = createCoordinateTransformer(bounds, 100, 100, 0);

      // Machine bottom (y=0)
      const { y: screenYBottom } = transform(50, 0);

      // Machine top (y=100)
      const { y: screenYTop } = transform(50, 100);

      // Screen: bottom should have HIGHER Y value (lower on screen = higher Y in screen coords)
      expect(screenYBottom).toBeGreaterThan(screenYTop);
    });

    it("should preserve X coordinates during Y inversion", () => {
      const segments = [{ x1: 0, y1: 0, x2: 100, y2: 100 }];
      const bounds = calculateBounds(segments);
      const transform = createCoordinateTransformer(bounds, 200, 200, 0);

      // Same X, different Y
      const { x: x1 } = transform(25, 0);
      const { x: x2 } = transform(25, 100);

      // X should remain the same
      expect(Math.abs(x1 - x2)).toBeLessThan(0.001);
    });

    it("should correctly flip Y for design not at origin", () => {
      const segments = [{ x1: 50, y1: 50, x2: 150, y2: 150 }];
      const bounds = calculateBounds(segments);
      const transform = createCoordinateTransformer(bounds, 600, 400, 20);

      // Bottom-left of design in machine coords
      const { y: yBL } = transform(50, 50);
      // Top-right of design in machine coords
      const { y: yTR } = transform(150, 150);

      // After inversion, bottom-left should have higher screen Y
      expect(yBL).toBeGreaterThan(yTR);
    });

    it("should map machine origin to bottom of screen", () => {
      const segments = [{ x1: 0, y1: 0, x2: 100, y2: 100 }];
      const bounds = calculateBounds(segments);
      const canvasHeight = 100;
      const transform = createCoordinateTransformer(
        bounds,
        100,
        canvasHeight,
        0,
      );

      // Machine origin (0, 0) should map to bottom of screen (high Y)
      const { y: screenY } = transform(0, 0);

      // Should be at canvas height (bottom)
      expect(screenY).toBe(canvasHeight);
    });
  });
});

describe("Job Time Calculation", () => {
  describe("calculateJobTime", () => {
    it("should calculate time for movement commands", () => {
      const gcode = [
        "G21",
        "G90",
        "F1000",
        "G0 X10 Y0", // 10 units at 5000 mm/min
        "G1 X20 Y0", // 10 units at 1000 mm/min
      ];

      const time = calculateJobTime(gcode, 1000, 5000);

      // G0: 10 / 5000 = 0.002 min
      // G1: 10 / 1000 = 0.01 min
      // Total: 0.012 min = 0.72 seconds
      const expected = (10 / 5000 + 10 / 1000) * 60;

      expect(Math.abs(time - expected)).toBeLessThan(0.001);
    });

    it("should calculate diagonal distance correctly", () => {
      const gcode = [
        "G1 X30 Y40", // 3-4-5 triangle, distance = 50
      ];

      const time = calculateJobTime(gcode, 1000, 5000);

      // Distance 50 at 1000 mm/min = 0.05 min = 3 seconds
      const expected = (50 / 1000) * 60;

      expect(Math.abs(time - expected)).toBeLessThan(0.001);
    });

    it("should respect custom feed rate from F command", () => {
      const gcode = ["F500", "G1 X10 Y0"];

      const time = calculateJobTime(gcode, 1000, 5000);

      // 10 units at 500 mm/min = 0.02 min = 1.2 seconds
      const expected = (10 / 500) * 60;

      expect(Math.abs(time - expected)).toBeLessThan(0.001);
    });

    it("should handle empty gcode array", () => {
      const time = calculateJobTime([]);
      expect(time).toBe(0);
    });
  });
});

describe("Req 10: Status UI", () => {
  describe("VALID_STATUSES", () => {
    it("should include all required status values", () => {
      expect(VALID_STATUSES).toContain("Printing");
      expect(VALID_STATUSES).toContain("Idle");
      expect(VALID_STATUSES).toContain("Paused");
      expect(VALID_STATUSES).toContain("Disconnected");
    });
  });

  describe("parseStatusMessage", () => {
    it("should parse STATUS messages correctly", () => {
      expect(parseStatusMessage("STATUS: Printing")).toBe("Printing");
      expect(parseStatusMessage("STATUS: Idle")).toBe("Idle");
      expect(parseStatusMessage("STATUS: Paused")).toBe("Paused");
    });

    it("should return null for non-status messages", () => {
      expect(parseStatusMessage("GCODE: G0 X10 Y10")).toBe(null);
      expect(parseStatusMessage("ACK: G0 X10 Y10")).toBe(null);
      expect(parseStatusMessage("")).toBe(null);
    });

    it("should handle null/undefined", () => {
      expect(parseStatusMessage(null)).toBe(null);
      expect(parseStatusMessage(undefined)).toBe(null);
    });
  });

  describe("getStatusClass", () => {
    it("should return lowercase status as CSS class", () => {
      expect(getStatusClass("Idle")).toBe("idle");
      expect(getStatusClass("Printing")).toBe("printing");
      expect(getStatusClass("Paused")).toBe("paused");
      expect(getStatusClass("Disconnected")).toBe("disconnected");
    });
  });
});

describe("Coordinate Transformation", () => {
  describe("createCoordinateTransformer - Aspect Ratio", () => {
    it("should preserve aspect ratio when scaling", () => {
      const segments = [{ x1: 0, y1: 0, x2: 100, y2: 100 }]; // Square
      const bounds = calculateBounds(segments);
      const transform = createCoordinateTransformer(bounds, 600, 400, 20);

      const bl = transform(0, 0);
      const tr = transform(100, 100);

      const screenWidth = Math.abs(tr.x - bl.x);
      const screenHeight = Math.abs(tr.y - bl.y);

      // Square should remain square (aspect ratio 1:1)
      expect(Math.abs(screenWidth - screenHeight)).toBeLessThan(0.001);
    });
  });
});
