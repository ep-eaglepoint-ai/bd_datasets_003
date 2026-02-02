import sys
import os
import math
import unittest

# Ensure we can import from the sibling directory
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from repository_after.coaster_safety_validator import (
    CoasterSafetyValidator, StraightSegment, ArcSegment,
    G_GRAVITY, SafetyReport
)

class TestCoasterSafetyValidator(unittest.TestCase):

    # --- STALL CHECKS ---

    def test_stall_on_slope(self):
        """Detect stall when velocity drops to zero uphill."""
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=1.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        # Not enough energy to climb 50m
        track = [StraightSegment(50.0, 30.0)]
        report = validator.validate(track)

        self.assertTrue(report.stalled)
        self.assertFalse(report.passed)
        self.assertEqual(report.final_velocity_mps, 0.0)

    def test_insufficient_energy_loop_results_in_derailment(self):
        """
        Edge Case: Running out of energy inside a loop.
        Physics Note: A train cannot 'stall' (v=0) statically while inverted or
        past 90 degrees vertical. Gravity will pull it off the track (N < 0)
        before it stops. This should flag Derailment, not Stall.
        """
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=15.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        # 15m/s -> ~11m max height. Loop is 20m high (r=10).
        # It will fail halfway up.
        track = [StraightSegment(1, 0), ArcSegment(10.0, 180.0)]
        report = validator.validate(track)

        # We expect a safety failure. Specifically derailment because
        # it falls off the track when v^2/r < -g*cos(theta)
        self.assertFalse(report.passed)
        self.assertTrue(report.derailment_risk)

    # --- DERAILMENT CHECKS ---

    def test_derailment_at_loop_top(self):
        """Derail if Centripetal < Gravity at top."""
        # Top of loop condition: v^2/r < g  => Derail
        # r=10, g=9.8. Need v < 9.9 m/s at top.
        # Enter at 21 m/s. Height gain 20m.
        # v_top^2 = v_bot^2 - 2gh = 441 - 392 = 49.
        # v_top = 7 m/s. Centripetal = 4.9 < 9.8.
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=21.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        track = [StraightSegment(1, 0), ArcSegment(10.0, 360.0)]
        report = validator.validate(track)

        self.assertTrue(report.derailment_risk)
        self.assertFalse(report.passed)
        # Ensure we tracked the trend towards negative Gs
        self.assertLess(report.min_g, 0.6)

    def test_negative_g_derailment_on_hill(self):
        """Detect negative normal force on sharp airtime hill."""
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=30.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        # Sharp hill (CW arc), r=10. v=30.
        track = [StraightSegment(1, 0), ArcSegment(10.0, -45.0)]
        report = validator.validate(track)

        self.assertTrue(report.derailment_risk)

    # --- FORCE CALCULATION CHECKS ---

    def test_drag_force_quadratic(self):
        """Drag is proportional to velocity squared."""
        m = 1000.0
        c = 10.0
        dt = 0.01
        # FIXED: Use a very long track so both runs are limited by TIME, not distance.
        track = [StraightSegment(1000.0, 0)]

        v1 = 10.0
        v2 = 20.0

        # Run both for exactly 0.1 seconds
        r1 = CoasterSafetyValidator(
            mass_kg=m, initial_velocity_mps=v1,
            rolling_friction_coeff=0, drag_coeff=c, dt=dt
        ).validate(track, max_time_s=0.1)

        r2 = CoasterSafetyValidator(
            mass_kg=m, initial_velocity_mps=v2,
            rolling_friction_coeff=0, drag_coeff=c, dt=dt
        ).validate(track, max_time_s=0.1)

        dv1 = v1 - r1.final_velocity_mps
        dv2 = v2 - r2.final_velocity_mps

        # dv ~ proportional to v^2. 20^2 / 10^2 = 4.
        self.assertAlmostEqual(dv2 / dv1, 4.0, delta=0.2)

    def test_friction_dynamic_normal_force(self):
        """Friction scales with G-force (Normal Force)."""
        mu = 0.1
        v0 = 20.0

        # 1. Flat track: N = mg
        # Use 20m length
        track_len = 20.0
        r_flat = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=v0, rolling_friction_coeff=mu, drag_coeff=0
        ).validate([StraightSegment(track_len, 0)])

        # 2. Valley (Pullout): N = mg + mv^2/r.
        # FIXED: Calculate sweep to make Arc length EXACTLY 20.0m
        # L = r * theta_rad => theta_rad = L / r = 20 / 20 = 1.0 rad
        # theta_deg = 1.0 * 180 / pi = 57.29...
        r_val = 20.0
        sweep_deg = math.degrees(track_len / r_val)

        r_arc = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=v0, rolling_friction_coeff=mu, drag_coeff=0
        ).validate([StraightSegment(0.01, 0), ArcSegment(r_val, sweep_deg)])

        # Velocity loss should be higher in arc because N > mg
        loss_flat = v0 - r_flat.final_velocity_mps
        loss_arc = v0 - r_arc.final_velocity_mps

        self.assertGreater(loss_arc, loss_flat)

    # --- GEOMETRY & LIMIT CHECKS ---

    def test_smoothness_kink_detection(self):
        """Handle transitions smoothly / Detect kinks."""
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=10,
            rolling_friction_coeff=0, drag_coeff=0
        )
        track = [StraightSegment(10, 0), StraightSegment(10, 10)]

        with self.assertRaisesRegex(ValueError, "Track kink"):
            validator.validate(track)

    def test_g_limits_exceeded_min(self):
        """Fail if Gs exceed limit (High Positive Gs)."""
        v0 = 40.0 # Fast!
        r = 10.0
        # Bottom of loop: G = 1 + v^2/rg = 1 + 1600/100 = 17G. Deadly.

        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=v0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        track = [StraightSegment(1, 0), ArcSegment(r, 45)]
        report = validator.validate(track, g_limits=(5.0, -1.0))

        self.assertFalse(report.passed)
        self.assertIn("G-Force", report.reason)
        self.assertGreater(report.max_g, 10.0)

    def test_initial_g_force(self):
        """Correction Check: G-force initializes correctly on start."""
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        # Start on flat: 1G
        track_flat = [StraightSegment(10, 0)]
        r_flat = validator.validate(track_flat)
        self.assertAlmostEqual(r_flat.max_g, 1.0)
        self.assertAlmostEqual(r_flat.min_g, 1.0)

        # Start on vertical drop (90 deg): 0G (Freefall)
        track_vert = [StraightSegment(10, 90)]
        r_vert = validator.validate(track_vert)
        self.assertAlmostEqual(r_vert.max_g, 0.0, delta=1e-5)

    def test_timeout(self):
        """Edge Case: Infinite loops or too long tracks."""
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=1.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        track = [StraightSegment(1000, 0)]
        report = validator.validate(track, max_time_s=0.1)

        self.assertFalse(report.passed)
        self.assertIn("Timeout", report.reason)

if __name__ == "__main__":
    unittest.main()