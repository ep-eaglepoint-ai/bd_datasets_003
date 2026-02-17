"""Simple benchmark report for before vs after.

Run inside container:
  PHYSICS_REPO=after  pytest -q tests
  python -m tests.report

This prints timings and a speedup percentage.
"""

from __future__ import annotations

import importlib.util
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load(which: str):
    module_path = ROOT / f"repository_{which}" / "physics.py"
    spec = importlib.util.spec_from_file_location(f"physics_{which}", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _make_particles(Particle, n: int, seed: int = 0):
    x = seed + 1
    particles = []
    for i in range(n):
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        fx = (x / 0x7FFFFFFF) * 10000.0 - 5000.0
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        fy = (x / 0x7FFFFFFF) * 10000.0 - 5000.0
        particles.append(Particle(i, fx, fy, 1.0))
    return particles


def _time_detect(physics, particles):
    t0 = time.perf_counter()
    physics.detect_collisions(particles)
    t1 = time.perf_counter()
    return t1 - t0


def main():
    before = _load("before")
    after = _load("after")

    n = 5000
    particles_before = _make_particles(before.Particle, n)
    particles_after = _make_particles(after.Particle, n)

    t_before = _time_detect(before, particles_before)
    t_after = _time_detect(after, particles_after)

    speedup = (t_before / t_after) if t_after > 0 else float("inf")
    improvement_pct = (1.0 - (t_after / t_before)) * 100.0 if t_before > 0 else 0.0

    print(f"Particles: {n}")
    print(f"Before: {t_before:.4f}s")
    print(f"After : {t_after:.4f}s")
    print(f"Speedup: {speedup:.1f}x")
    print(f"Improvement: {improvement_pct:.1f}%")


if __name__ == "__main__":
    main()
