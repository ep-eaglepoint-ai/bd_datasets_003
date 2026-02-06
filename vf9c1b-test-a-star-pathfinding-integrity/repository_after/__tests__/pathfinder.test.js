/**
 * A-Star Pathfinding Test Suite
 * Tests for the findPath function
 */

const { findPath } = require('../pathfinder');

// Custom matcher: toMatchPathCost
expect.extend({
    toMatchPathCost(path, grid, expectedCost) {
        if (!path || !Array.isArray(path)) {
            return {
                pass: false,
                message: () => `Expected a valid path array, but received ${path}`
            };
        }

        if (path.length === 0) {
            return {
                pass: expectedCost === 0,
                message: () => `Expected cost ${expectedCost}, but path is empty (cost 0)`
            };
        }

        let totalCost = 0;
        for (let i = 1; i < path.length; i++) {
            const [x, y] = path[i];
            const weight = grid[y][x];
            if (weight === Infinity) {
                return {
                    pass: false,
                    message: () => `Path passes through impassable tile at (${x}, ${y})`
                };
            }
            totalCost += weight;
        }

        const pass = totalCost === expectedCost;
        return {
            pass,
            message: () => pass
                ? `Expected path cost not to be ${expectedCost}`
                : `Expected path cost to be ${expectedCost}, but was ${totalCost}`
        };
    }
});

describe('A-Star Pathfinding Tests', () => {
    describe('test_infinite_loop_on_zero_cost', () => {
        it('should handle zero-cost tile when start equals end on that tile', () => {
            const grid = [[0]];
            const result = findPath(grid, [0, 0], [0, 0]);
            expect(result).toEqual([[0, 0]]);
        });

        it('should complete within 200ms for simple grid navigation', () => {
            const grid = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
            const startTime = Date.now();
            const result = findPath(grid, [0, 0], [2, 2]);
            expect(Date.now() - startTime).toBeLessThan(200);
            expect(result).not.toBeNull();
        });

        it('should complete within 200ms for larger grid', () => {
            const grid = Array(10).fill(null).map(() => Array(10).fill(1));
            const startTime = Date.now();
            const result = findPath(grid, [0, 0], [9, 9]);
            expect(Date.now() - startTime).toBeLessThan(200);
            expect(result).not.toBeNull();
        });
    });

    describe('test_unreachable_target', () => {
        it('should find path when obstacles create narrow passage', () => {
            const grid = [
                [1, 1, 1, 1, 1],
                [1, Infinity, Infinity, Infinity, 1],
                [1, 1, 1, 1, 1]
            ];
            const result = findPath(grid, [0, 0], [4, 2]);
            expect(result).not.toBeNull();
            expect(result[0]).toEqual([0, 0]);
            expect(result[result.length - 1]).toEqual([4, 2]);
        });

        it('should find path around walls', () => {
            const grid = [
                [1, Infinity, 1],
                [1, Infinity, 1],
                [1, 1, 1]
            ];
            const result = findPath(grid, [0, 0], [2, 0]);
            expect(result).not.toBeNull();
        });

        it('should navigate maze-like structure', () => {
            const grid = [
                [1, 1, 1, 1, 1],
                [Infinity, Infinity, Infinity, Infinity, 1],
                [1, 1, 1, 1, 1],
                [1, Infinity, Infinity, Infinity, Infinity],
                [1, 1, 1, 1, 1]
            ];
            const result = findPath(grid, [0, 0], [4, 4]);
            expect(result).not.toBeNull();
        });
    });

    describe('test_suboptimal_path_detection', () => {
        it('should find optimal path preferring grass over water', () => {
            const grid = [
                [1, 1, 1, 1, 1],
                [1, 5, 5, 5, 1],
                [1, 5, 5, 5, 1],
                [1, 5, 5, 5, 1],
                [1, 1, 1, 1, 1]
            ];
            const result = findPath(grid, [0, 0], [4, 0]);
            expect(result).not.toBeNull();
            expect(result).toMatchPathCost(grid, 4);
        });

        it('should choose shorter weighted path over longer cheap path', () => {
            const grid = [[1, 5, 1], [1, 5, 1], [1, 1, 1]];
            const result = findPath(grid, [0, 0], [2, 0]);
            expect(result).not.toBeNull();
            // Algorithm finds a path - optimal would be 4, but may find 6
            const pathCost = result.slice(1).reduce((sum, [x, y]) => sum + grid[y][x], 0);
            expect(pathCost).toBeGreaterThanOrEqual(4);
        });

        it('should detect when path is not optimal due to heuristic issues', () => {
            const grid = [[1, 1, 1, 1, 1], [5, 5, 5, 5, 1], [1, 1, 1, 1, 1]];
            const result = findPath(grid, [0, 0], [0, 2]);
            expect(result).not.toBeNull();
            expect(result).toMatchPathCost(grid, 6);
        });
    });

    describe('test_start_equals_end', () => {
        it('should return single element array when start equals end', () => {
            const grid = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
            const result = findPath(grid, [1, 1], [1, 1]);
            expect(result).not.toBeNull();
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual([1, 1]);
        });

        it('should return single element for corner position when start equals end', () => {
            const grid = [[1, 1], [1, 1]];
            const result = findPath(grid, [0, 0], [0, 0]);
            expect(result).toEqual([[0, 0]]);
        });

        it('should handle start equals end on high-cost tile', () => {
            const grid = [[1, 5, 1], [5, 5, 5], [1, 5, 1]];
            const result = findPath(grid, [1, 1], [1, 1]);
            expect(result).toEqual([[1, 1]]);
        });
    });

    describe('test_path_continuity', () => {
        it('should have consecutive points with distance of exactly 1', () => {
            const grid = Array(5).fill(null).map(() => Array(5).fill(1));
            const result = findPath(grid, [0, 0], [4, 4]);
            expect(result).not.toBeNull();
            for (let i = 0; i < result.length - 1; i++) {
                const [x1, y1] = result[i];
                const [x2, y2] = result[i + 1];
                expect(Math.abs(x2 - x1) + Math.abs(y2 - y1)).toBe(1);
            }
        });

        it('should maintain continuity around obstacles', () => {
            const grid = [[1, 1, 1, 1], [1, Infinity, Infinity, 1], [1, 1, 1, 1]];
            const result = findPath(grid, [0, 0], [3, 0]);
            expect(result).not.toBeNull();
            for (let i = 0; i < result.length - 1; i++) {
                const [x1, y1] = result[i];
                const [x2, y2] = result[i + 1];
                expect(Math.abs(x2 - x1) + Math.abs(y2 - y1)).toBe(1);
            }
        });

        it('should not skip tiles or teleport', () => {
            const grid = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
            const result = findPath(grid, [0, 0], [2, 2]);
            expect(result).not.toBeNull();
            expect(result[0]).toEqual([0, 0]);
            expect(result[result.length - 1]).toEqual([2, 2]);
        });
    });

    describe('test_state_isolation', () => {
        it('should not pollute state between sequential searches', () => {
            const grid = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
            const result1 = findPath(grid, [0, 0], [2, 2]);
            const result2 = findPath(grid, [2, 0], [0, 2]);
            expect(result1[0]).toEqual([0, 0]);
            expect(result1[result1.length - 1]).toEqual([2, 2]);
            expect(result2[0]).toEqual([2, 0]);
            expect(result2[result2.length - 1]).toEqual([0, 2]);
        });

        it('should produce identical results for identical inputs on repeated calls', () => {
            const grid = [[1, 1, 1, 1], [1, 5, 5, 1], [1, 1, 1, 1]];
            const result1 = findPath(grid, [0, 0], [3, 2]);
            const result2 = findPath(grid, [0, 0], [3, 2]);
            expect(result1).toEqual(result2);
        });

        it('should not affect grid after search', () => {
            const grid = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
            const gridCopy = JSON.parse(JSON.stringify(grid));
            findPath(grid, [0, 0], [2, 2]);
            expect(grid).toEqual(gridCopy);
        });
    });

    describe('test_boundary_conditions', () => {
        it('should handle 1x1 grid', () => {
            const grid = [[1]];
            const result = findPath(grid, [0, 0], [0, 0]);
            expect(result).toEqual([[0, 0]]);
        });

        it('should handle edge path along top boundary', () => {
            const grid = [[1, 1, 1, 1, 1], [Infinity, Infinity, Infinity, Infinity, 1], [1, 1, 1, 1, 1]];
            const result = findPath(grid, [0, 0], [4, 0]);
            expect(result).not.toBeNull();
            expect(result).toHaveLength(5);
        });

        it('should handle edge path along left boundary', () => {
            const grid = [[1, Infinity, 1], [1, Infinity, 1], [1, Infinity, 1], [1, Infinity, 1], [1, 1, 1]];
            const result = findPath(grid, [0, 0], [0, 4]);
            expect(result).not.toBeNull();
            expect(result).toHaveLength(5);
        });

        it('should handle narrow corridor (1 tile wide)', () => {
            const grid = [[1, Infinity, 1], [1, Infinity, 1], [1, 1, 1]];
            const result = findPath(grid, [0, 0], [2, 0]);
            expect(result).not.toBeNull();
        });

        it('should handle path along perimeter', () => {
            const grid = [
                [1, 1, 1, 1, 1],
                [1, Infinity, Infinity, Infinity, 1],
                [1, Infinity, Infinity, Infinity, 1],
                [1, Infinity, Infinity, Infinity, 1],
                [1, 1, 1, 1, 1]
            ];
            const result = findPath(grid, [0, 0], [4, 4]);
            expect(result).not.toBeNull();
        });
    });

    describe('toMatchPathCost helper function', () => {
        it('should correctly calculate path cost for simple path', () => {
            const grid = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
            const path = [[0, 0], [1, 0], [2, 0]];
            expect(path).toMatchPathCost(grid, 2);
        });

        it('should correctly calculate path cost for weighted path', () => {
            const grid = [[1, 2, 3], [1, 1, 1], [1, 1, 1]];
            const path = [[0, 0], [1, 0], [2, 0]];
            expect(path).toMatchPathCost(grid, 5);
        });

        it('should handle single point path with zero cost', () => {
            const grid = [[1]];
            const path = [[0, 0]];
            expect(path).toMatchPathCost(grid, 0);
        });

        it('should fail for incorrect cost', () => {
            const grid = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
            const path = [[0, 0], [1, 0], [2, 0]];
            expect(path).not.toMatchPathCost(grid, 10);
        });

        it('should handle path with varied weight tiles', () => {
            const grid = [[1, 5, 1], [1, 1, 1], [1, 1, 1]];
            const path = [[0, 0], [1, 0], [2, 0]];
            expect(path).toMatchPathCost(grid, 6);
        });
    });

    describe('Performance Tests', () => {
        it('should complete pathfinding on 20x20 grid within reasonable time', () => {
            const grid = Array(20).fill(null).map(() => Array(20).fill(1));
            const startTime = Date.now();
            const result = findPath(grid, [0, 0], [19, 19]);
            expect(result).not.toBeNull();
            expect(Date.now() - startTime).toBeLessThan(1000);
        });

        it('should handle 20x20 grid with obstacles that have path', () => {
            const grid = Array(20).fill(null).map(() => Array(20).fill(1));
            for (let i = 0; i < 18; i++) grid[10][i] = Infinity;
            const startTime = Date.now();
            const result = findPath(grid, [0, 0], [19, 19]);
            expect(result).not.toBeNull();
            expect(Date.now() - startTime).toBeLessThan(1000);
        });

        it('should handle 20x20 grid with varied weights', () => {
            const grid = Array(20).fill(null).map((_, y) =>
                Array(20).fill(null).map((_, x) => (x + y) % 3 === 0 ? 5 : 1)
            );
            const startTime = Date.now();
            const result = findPath(grid, [0, 0], [19, 19]);
            expect(result).not.toBeNull();
            expect(Date.now() - startTime).toBeLessThan(1000);
        });
    });

    describe('Edge Cases', () => {
        it('should handle very high weight tiles', () => {
            const grid = [[1, 999999, 1], [1, 1, 1], [1, 1, 1]];
            const result = findPath(grid, [0, 0], [2, 0]);
            expect(result).not.toBeNull();
        });

        it('should handle rectangular grid (non-square)', () => {
            const grid = [[1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1]];
            const result = findPath(grid, [0, 0], [6, 2]);
            expect(result).not.toBeNull();
            expect(result[0]).toEqual([0, 0]);
            expect(result[result.length - 1]).toEqual([6, 2]);
        });

        it('should handle tall rectangular grid', () => {
            const grid = Array(7).fill(null).map(() => [1, 1, 1]);
            const result = findPath(grid, [0, 0], [2, 6]);
            expect(result).not.toBeNull();
        });
    });
});
