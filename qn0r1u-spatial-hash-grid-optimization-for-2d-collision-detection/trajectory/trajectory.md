# Trajectory

## Analysis (Bottleneck Identification)

### Symptom
Severe frame drops once particle counts exceed ~2,000.

### Root cause
The legacy `detect_collisions` uses a brute-force double loop over all pairs, producing $O(N^2)$ distance checks.

### How to reproduce profiling locally

1) Run a quick micro-benchmark inside the container:

- `docker compose run --rm test-report`

2) Capture a profiler report(optional tho)

Because this repository is intended to run hermetically and with minimal dependencies, the canonical profiling approach is built-in `cProfile`:

- `python -m cProfile -s tottime -m tests.report`

Capture screenshots of the `cProfile` output table in your terminal.

Expected observation:
- In the legacy implementation, nearly all time is inside the nested-pair loop and the distance check.

## Optimization Approach

### Chosen optimization for Sparse Spatial Hash Grid
i convert the broad-phase from "check every pair" to "check only local neighbors".

Key design decisions:
- Used a dictionary-backed sparse grid (hash map) so coordinates can be large or negative without allocating huge arrays.
- Set `cell_size = 2 * max_particle_radius` so any colliding pair must lie in the same cell or one of the 8 surrounding cells.
- Use floor-based hashing for stability with negative coordinates.
Trade-offs considered:
- Uniform grid is simple and fast for educational physics engines.
- More complex structures (BVH, k-d tree) add complexity and are harder to teach

## Implementation

Implementation basically loves in `repository_after/physics.py`.

1) Compute `max_radius` and derive `cell_size = 2 * max_radius`.
2) Convert each particle position into integer cell coordinates:
	- $c_x = \lfloor x / cell\_size \rfloor$
	- $c_y = \lfloor y / cell\_size \rfloor$
3) Insert particle indices into `grid[(c_x, c_y)] -> list[int]`.
4) For each particle, query only the 3x3 neighborhood around its cell.
5) De-duplicate pairs by only checking candidates with index `j > i`.

### Complexity
- Legacy: $O(N^2)$ pair checks.
- Spatial hash grid: expected $O(N)$ average (with a small constant factor), assuming a roughly uniform distribution.

## Verification
### Correctness
`tests/test_spatial_hash_grid.py` verifies:
- exact output compatibility vs a brute-force reference for random cases.
- Boundary-case correctness: collisions across a cell boundary are detected by querying neighbor cells.
- Negative coordinates behave correctly.
- Sparse/unbounded coordinates do not cause large allocations.

### Performance
The performance gate injects 5,000 particles and asserts the optimized implementation runs in < 0.2s.

The `tests/report.py` script prints before/after timings and a computed speedup.

## Resources

- Spatial hashing and uniform grids for broad-phase collision detection

