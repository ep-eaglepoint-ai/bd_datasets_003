
import { describe, it, expect } from 'vitest';
import { calculateBounds, calculateTransform, toScreen } from '../repository_after/frontend/src/utils/visualizerUtils';

describe('Visualizer Logic', () => {
    it('calculates bounding box correctly', () => {
        const segments = [
            { x1: 0, y1: 0, x2: 10, y2: 10 },
            { x1: 10, y1: 10, x2: 20, y2: 20 }
        ];
        const bounds = calculateBounds(segments);
        expect(bounds.minX).toBe(0);
        expect(bounds.maxX).toBe(20);
        expect(bounds.minY).toBe(0);
        expect(bounds.maxY).toBe(20);
        expect(bounds.width).toBe(20);
        expect(bounds.height).toBe(20);
    });

    it('calculates transform (scale/offset) to center content', () => {
        // Bounds 20x20. Canvas 100x100. Padding 10.
        // Available: 80x80.
        // Scale should be 80/20 = 4.
        const bounds = { minX: 0, maxX: 20, minY: 0, maxY: 20, width: 20, height: 20 };
        const { scale, offsetX, offsetY } = calculateTransform(bounds, 100, 100, 10);
        
        expect(scale).toBe(4);
        
        // Centering:
        // Width * Scale = 20 * 4 = 80.
        // Canvas Width = 100.
        // (100 - 80) / 2 = 10.
        // OffsetX = 10 - minX * scale = 10 - 0 = 10.
        expect(offsetX).toBe(10);
        expect(offsetY).toBe(10);
    });

    it('transforms coordinates with Y-flip', () => {
        // Assume Scale 1, Offset 0, Height 100.
        // Input (10, 10).
        // Screen X = 10 * 1 + 0 = 10.
        // Screen Y = 100 - (10 * 1 + 0) = 90.
        const pt = toScreen(10, 10, 1, 0, 0, 100);
        expect(pt.x).toBe(10);
        expect(pt.y).toBe(90);
    });
});
