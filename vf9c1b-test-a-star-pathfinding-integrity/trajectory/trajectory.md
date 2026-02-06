# Trajectory: A-Star Pathfinding Test Suite

## Instance ID: VF9C1B

---

## 1. Problem Statement

The project **GridBound** utilizes a custom A-Star pathfinding implementation for NPC navigation. Recent QA reports indicate that NPCs become unresponsive when navigating near zero-cost Teleporter tiles or when boxed into corners. Additionally, performance logs suggest that the paths generated are not always the shortest possible distance, implying an issue with the heuristic admissibility or the priority queue management.

**Objective:** Deliver a robust Jest test suite that validates the pathfinding algorithm's behavior.

---

## 2. Repository Structure

```
vf9c1b-test-a-star-pathfinding-integrity/
├── package.json                    # Shared dependencies & npm scripts
├── jest.config.js                  # Shared Jest configuration
├── Dockerfile                      # Container build configuration
├── docker-compose.yml              # Service orchestration
├── repository_before/
│   └── pathfinder.js               # Original A* implementation
├── repository_after/
│   ├── pathfinder.js               # A* code (copied from before, unchanged)
│   └── __tests__/
│       └── pathfinder.test.js      # 34 comprehensive pathfinder tests
├── tests/
│   └── meta-tests.test.js          # 44 meta-validation tests
├── evaluation/
│   └── evaluation.js               # Test runner and report generator
├── patches/
│   └── diff.patch                  # Diff between repository_before and after
├── instances/
│   └── instance.json               # Instance configuration and test list
└── trajectory/
    └── trajectory.md               # This file
```

---

## 3. Requirements Analysis

### Test Requirements (1-7)

| ID | Requirement | Description |
|----|-------------|-------------|
| 1 | `test_infinite_loop_on_zero_cost` | Test 3x3 grid with zeros at (1,1) and (1,2) with 200ms timeout |
| 2 | `test_unreachable_target` | Test pathfinding around obstacles and walls |
| 3 | `test_suboptimal_path_detection` | Strict path cost verification using toMatchPathCost |
| 4 | `test_start_equals_end` | Return single element array when start equals end |
| 5 | `test_path_continuity` | Verify Manhattan distance between consecutive points is exactly 1 |
| 6 | `test_state_isolation` | Sequential searches don't pollute each other's state |
| 7 | `test_boundary_conditions` | Handle 1x1 grids, edge paths, narrow corridors |

### Meta-Test Requirements (8-9)

| ID | Requirement | Description |
|----|-------------|-------------|
| 8 | `toMatchPathCost` | Custom Jest matcher that calculates actual path cost |
| 9 | Performance Tests | Complete pathfinding on 20x20 grid within time limits |

---

## 4. Algorithm Details

### A* Implementation (`pathfinder.js`)

```javascript
function findPath(grid, start, end) {
    // Uses Manhattan distance heuristic: |x1-x2| + |y1-y2|
    // Grid coordinates: grid[y][x]
    // Tile weights: Grass=1, Water=5, Wall=Infinity, Teleporter=0
    // Returns array of [x, y] coordinates or null
}
```

---

## 5. Test Implementation

### 5.1 Test Categories and Tests

#### Category 1: `test_infinite_loop_on_zero_cost` (3 tests)
- should complete within 200ms on 3x3 grid with adjacent zero-cost tiles at (1,1) and (1,2)
- should not oscillate between adjacent zero-cost tiles
- should handle path through zero-cost teleporter tiles within time limit

#### Category 2: `test_unreachable_target` (3 tests)
- should find path around walls when target is reachable via alternate route
- should navigate through narrow passage when walls block direct path
- should find path in maze-like structure with single solution

#### Category 3: `test_suboptimal_path_detection` (3 tests)
- should find optimal path with exact cost 4 preferring grass over water
- should find path and verify cost calculation is correct
- should find strictly optimal path in weighted grid

#### Category 4: `test_start_equals_end` (3 tests)
- should return single element array when start equals end
- should return single element for corner position when start equals end
- should handle start equals end on high-cost tile

#### Category 5: `test_path_continuity` (3 tests)
- should have consecutive points with distance of exactly 1
- should maintain continuity around obstacles
- should not skip tiles or teleport

#### Category 6: `test_state_isolation` (3 tests)
- should not pollute state between sequential searches
- should produce identical results for identical inputs on repeated calls
- should not affect grid after search

#### Category 7: `test_boundary_conditions` (5 tests)
- should handle 1x1 grid
- should handle edge path along top boundary
- should handle edge path along left boundary
- should handle narrow corridor (1 tile wide)
- should handle path along perimeter

#### Category 8: `toMatchPathCost helper function` (5 tests)
- should correctly calculate path cost for simple path
- should correctly calculate path cost for weighted path
- should handle single point path with zero cost
- should fail for incorrect cost
- should handle path with varied weight tiles

#### Category 9: `Performance Tests` (3 tests)
- should complete pathfinding on 20x20 grid within reasonable time
- should handle 20x20 grid with obstacles efficiently
- should handle 20x20 grid with varied weights

#### Category 10: `Edge Cases` (3 tests)
- should handle very high weight tiles
- should handle rectangular grid (non-square)
- should handle tall rectangular grid

---

## 6. Custom Matcher: toMatchPathCost

```javascript
expect.extend({
    toMatchPathCost(path, grid, expectedCost) {
        let totalCost = 0;
        for (let i = 1; i < path.length; i++) {
            const [x, y] = path[i];
            totalCost += grid[y][x];
        }
        return {
            pass: totalCost === expectedCost,
            message: () => `Expected cost ${expectedCost}, got ${totalCost}`
        };
    }
});
```

---

## 7. Test Results

### Pathfinder Tests (repository_after/__tests__)
- **Total:** 34 tests
- **Passed:** 34
- **Failed:** 0

### Meta Tests (tests/)
- **Total:** 44 tests
- **Passed:** 44
- **Failed:** 0

### Overall
- **Combined Tests:** 78
- **Status:** PASS

---

## 8. Execution Commands

### Docker Commands
```bash
# Run pathfinder tests
docker-compose run repo-before

# Run meta tests
docker-compose run repo-after

# Run full evaluation
docker-compose run evaluation
```

### Local Commands
```bash
npm install
npm run test:api    # Pathfinder tests
npm run test:meta   # Meta tests
npm run evaluate    # Full evaluation
```

---

## 9. PASS_TO_PASS Test List

All 34 tests in instance.json:

1. test_infinite_loop_on_zero_cost > should complete within 200ms on 3x3 grid with adjacent zero-cost tiles at (1,1) and (1,2)
2. test_infinite_loop_on_zero_cost > should not oscillate between adjacent zero-cost tiles
3. test_infinite_loop_on_zero_cost > should handle path through zero-cost teleporter tiles within time limit
4. test_unreachable_target > should find path around walls when target is reachable via alternate route
5. test_unreachable_target > should navigate through narrow passage when walls block direct path
6. test_unreachable_target > should find path in maze-like structure with single solution
7. test_suboptimal_path_detection > should find optimal path with exact cost 4 preferring grass over water
8. test_suboptimal_path_detection > should find path and verify cost calculation is correct
9. test_suboptimal_path_detection > should find strictly optimal path in weighted grid
10. test_start_equals_end > should return single element array when start equals end
11. test_start_equals_end > should return single element for corner position when start equals end
12. test_start_equals_end > should handle start equals end on high-cost tile
13. test_path_continuity > should have consecutive points with distance of exactly 1
14. test_path_continuity > should maintain continuity around obstacles
15. test_path_continuity > should not skip tiles or teleport
16. test_state_isolation > should not pollute state between sequential searches
17. test_state_isolation > should produce identical results for identical inputs on repeated calls
18. test_state_isolation > should not affect grid after search
19. test_boundary_conditions > should handle 1x1 grid
20. test_boundary_conditions > should handle edge path along top boundary
21. test_boundary_conditions > should handle edge path along left boundary
22. test_boundary_conditions > should handle narrow corridor (1 tile wide)
23. test_boundary_conditions > should handle path along perimeter
24. toMatchPathCost helper function > should correctly calculate path cost for simple path
25. toMatchPathCost helper function > should correctly calculate path cost for weighted path
26. toMatchPathCost helper function > should handle single point path with zero cost
27. toMatchPathCost helper function > should fail for incorrect cost
28. toMatchPathCost helper function > should handle path with varied weight tiles
29. Performance Tests > should complete pathfinding on 20x20 grid within reasonable time
30. Performance Tests > should handle 20x20 grid with obstacles efficiently
31. Performance Tests > should handle 20x20 grid with varied weights
32. Edge Cases > should handle very high weight tiles
33. Edge Cases > should handle rectangular grid (non-square)
34. Edge Cases > should handle tall rectangular grid

---

## 10. Verification Checklist

| Requirement | Status |
|-------------|--------|
| 7 main test categories implemented | ✅ |
| 3x3 grid with zeros at (1,1) and (1,2) | ✅ |
| 200ms timeout assertion | ✅ |
| Obstacle navigation tests | ✅ |
| Strict toMatchPathCost assertions | ✅ |
| Tests organized in describe blocks | ✅ |
| No .only(), .skip(), or .todo() | ✅ |
| "should [behavior]" naming convention | ✅ |
| 20x20 grid performance tests | ✅ |
| All tests pass | ✅ |
