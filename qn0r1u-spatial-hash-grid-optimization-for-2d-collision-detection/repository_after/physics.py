"""Physics primitives.

This module contains an optimized broad-phase collision detector based on a sparse
Spatial Hash Grid.

Constraints:
- Pure Python (no numpy/scipy/C extensions)
- Handles unbounded world coordinates (incl. negatives) via dict-backed sparse grid
- Returns the same collision set as the legacy brute-force implementation
"""

from __future__ import annotations

import math
from typing import Iterable


class Particle:
    def __init__(self, id, x, y, radius):
        self.id = id
        self.x = x
        self.y = y
        self.radius = radius


def _max_radius(particles: list[Particle]) -> float:
    max_r = 0.0
    for p in particles:
        r = p.radius
        if r > max_r:
            max_r = r
    return max_r


def _build_grid(
    particles: list[Particle], inv_cell_size: float
) -> tuple[dict[tuple[int, int], list[int]], list[tuple[int, int]]]:
    grid: dict[tuple[int, int], list[int]] = {}
    coords: list[tuple[int, int]] = [(0, 0)] * len(particles)
    floor = math.floor

    for i, p in enumerate(particles):
        cx = int(floor(p.x * inv_cell_size))
        cy = int(floor(p.y * inv_cell_size))
        coords[i] = (cx, cy)
        key = (cx, cy)
        bucket = grid.get(key)
        if bucket is None:
            grid[key] = [i]
        else:
            bucket.append(i)

    return grid, coords


def _neighbor_keys(cx: int, cy: int):
    for nx in (cx - 1, cx, cx + 1):
        for ny in (cy - 1, cy, cy + 1):
            yield (nx, ny)


def _accumulate_collisions_for_particle(
    particle_index: int,
    particle_list: list[Particle],
    cell_coords: list[tuple[int, int]],
    get_bucket,
    collisions: set[tuple],
):
    p1 = particle_list[particle_index]
    x1 = p1.x
    y1 = p1.y
    r1 = p1.radius
    id1 = p1.id
    cx, cy = cell_coords[particle_index]

    for key in _neighbor_keys(cx, cy):
        bucket = get_bucket(key)
        if not bucket:
            continue

        for j in bucket:
            if j <= particle_index:
                continue

            p2 = particle_list[j]
            dx = x1 - p2.x
            dy = y1 - p2.y
            radii_sum = r1 + p2.radius
            if (dx * dx + dy * dy) < (radii_sum * radii_sum):
                collisions.add(tuple(sorted((id1, p2.id))))


def _detect_collisions_bruteforce(particles: list[Particle]) -> set[tuple]:
    collisions: set[tuple] = set()
    for i in range(len(particles)):
        p1 = particles[i]
        x1 = p1.x
        y1 = p1.y
        r1 = p1.radius
        id1 = p1.id
        for j in range(i + 1, len(particles)):
            p2 = particles[j]
            dx = x1 - p2.x
            dy = y1 - p2.y
            radii_sum = r1 + p2.radius
            if (dx * dx + dy * dy) < (radii_sum * radii_sum):
                collisions.add(tuple(sorted((id1, p2.id))))
    return collisions


def detect_collisions(particles: Iterable[Particle]) -> set[tuple]:
    """Detect particle overlaps.

    Uses a sparse Spatial Hash Grid broad-phase:
    - cell_size is strictly `max_particle_radius * 2`
    - particles are bucketed by cell key (floor(x / cell_size), floor(y / cell_size))
    - each particle only checks candidates in its cell and 8 neighbors

    Returns:
        set of (idA, idB) tuples, sorted within each tuple.
    """

    particle_list = list(particles)
    particle_count = len(particle_list)
    if particle_count < 2:
        return set()

    max_radius = _max_radius(particle_list)

    if max_radius <= 0.0:
        return _detect_collisions_bruteforce(particle_list)

    cell_size = max_radius * 2.0
    inv_cell_size = 1.0 / cell_size

    grid, cell_coords = _build_grid(particle_list, inv_cell_size)

    collisions: set[tuple] = set()
    get_bucket = grid.get

    for i in range(particle_count):
        _accumulate_collisions_for_particle(
            particle_index=i,
            particle_list=particle_list,
            cell_coords=cell_coords,
            get_bucket=get_bucket,
            collisions=collisions,
        )

    return collisions
