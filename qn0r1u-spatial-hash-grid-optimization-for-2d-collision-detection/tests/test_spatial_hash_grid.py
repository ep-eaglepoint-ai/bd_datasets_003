import importlib.util
import inspect
import os
import random
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _load_physics_module(which: str):
    if which not in {"before", "after"}:
        raise ValueError(f"Unknown PHYSICS_REPO: {which!r}")

    module_path = ROOT / f"repository_{which}" / "physics.py"
    spec = importlib.util.spec_from_file_location(f"physics_{which}", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load module from {module_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _repo_choice() -> str:
    return os.environ.get("PHYSICS_REPO", "after")


def _bruteforce_collisions(particles):
    collisions = set()
    for i in range(len(particles)):
        for j in range(i + 1, len(particles)):
            p1 = particles[i]
            p2 = particles[j]
            dx = p1.x - p2.x
            dy = p1.y - p2.y
            dist_sq = dx * dx + dy * dy
            radii_sum = p1.radius + p2.radius
            if dist_sq < radii_sum * radii_sum:
                collisions.add(tuple(sorted((p1.id, p2.id))))
    return collisions


class SpatialHashGridTests(unittest.TestCase):
    def setUp(self):
        self.repo_choice = _repo_choice()
        self.physics = _load_physics_module(self.repo_choice)

    def test_signature_and_return_type(self):
        particle_cls = self.physics.Particle
        particles = [
            particle_cls(1, 0.0, 0.0, 1.0),
            particle_cls(2, 0.5, 0.0, 1.0),
            particle_cls(3, 10.0, 10.0, 1.0),
        ]
        collisions = self.physics.detect_collisions(particles)

        self.assertIsInstance(collisions, set)
        for pair in collisions:
            self.assertIsInstance(pair, tuple)
            self.assertEqual(len(pair), 2)
            self.assertEqual(pair, tuple(sorted(pair)))

    def test_correctness_matches_bruteforce_small_random(self):
        particle_cls = self.physics.Particle
        rng = random.Random(0)

        particles = []
        for i in range(200):
            x = rng.uniform(-50.0, 50.0)
            y = rng.uniform(-50.0, 50.0)
            radius = rng.uniform(0.5, 3.0)
            particles.append(particle_cls(i, x, y, radius))

        expected = _bruteforce_collisions(particles)
        got = self.physics.detect_collisions(particles)
        self.assertEqual(got, expected)

    def test_boundary_problem_neighbor_cells_detected(self):
        particle_cls = self.physics.Particle

        # max_radius = 5 -> cell_size = 10. Opposite sides of x=10 boundary.
        p1 = particle_cls(1, 9.9, 0.0, 1.0)
        p2 = particle_cls(2, 10.1, 0.0, 1.0)
        # Include a larger particle to force cell_size=10 (2*5)
        p3 = particle_cls(3, 100.0, 100.0, 5.0)

        collisions = self.physics.detect_collisions([p1, p2, p3])
        self.assertIn((1, 2), collisions)

    def test_negative_coordinates_bucketed_with_floor_and_neighbor_checked(self):
        particle_cls = self.physics.Particle

        # max_radius = 5 -> cell_size = 10. -0.1 floors to -1, +0.1 floors to 0.
        p1 = particle_cls(1, -0.1, 0.0, 1.0)
        p2 = particle_cls(2, 0.1, 0.0, 1.0)
        p3 = particle_cls(3, 50.0, 50.0, 5.0)

        collisions = self.physics.detect_collisions([p1, p2, p3])
        self.assertIn((1, 2), collisions)

    def test_sparse_world_unbounded_coords_no_massive_allocation(self):
        particle_cls = self.physics.Particle

        p1 = particle_cls(1, 0.0, 0.0, 1.0)
        p2 = particle_cls(2, 100000.0, 100000.0, 1.0)

        collisions = self.physics.detect_collisions([p1, p2])
        self.assertEqual(collisions, set())

    def test_after_avoids_global_double_nested_loop(self):
        if self.repo_choice != "after":
            self.skipTest("Structural optimization requirement applies to repository_after")

        src = inspect.getsource(self.physics.detect_collisions)
        self.assertNotIn("for i in range(len(", src)
        self.assertNotIn("for j in range(i + 1", src)

    def test_after_uses_floor_hashing_and_max_radius_cell_size(self):
        if self.repo_choice != "after":
            self.skipTest("Implementation details requirement applies to repository_after")

        src = inspect.getsource(self.physics.detect_collisions)
        self.assertTrue("math.floor" in src or "floor(" in src)
        self.assertIn("max_radius", src)
        self.assertTrue("* 2" in src or "2.0" in src)

    def test_performance_5000_particles_under_200ms(self):
        particle_cls = self.physics.Particle

        rng = random.Random(0)
        particles = [
            particle_cls(
                i,
                rng.uniform(-5000.0, 5000.0),
                rng.uniform(-5000.0, 5000.0),
                1.0,
            )
            for i in range(5000)
        ]

        t0 = time.perf_counter()
        collisions = self.physics.detect_collisions(particles)
        t1 = time.perf_counter()

        self.assertIsInstance(collisions, set)
        elapsed = t1 - t0
        self.assertLess(elapsed, 0.2, f"detect_collisions took {elapsed:.4f}s (> 0.2s)")
