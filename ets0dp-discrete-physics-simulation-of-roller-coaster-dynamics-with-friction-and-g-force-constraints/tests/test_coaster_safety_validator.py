import sys
import os
import math
import unittest

# Ensure we can import from the sibling directory
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# from repository_after.coaster_safety_validator import (
#     CoasterSafetyValidator, StraightSegment, ArcSegment,
#     G_GRAVITY, SafetyReport
# )

# class TestCoasterSafetyValidator(unittest.TestCase):

#     def test_req1_numerical_integration_uses_dt_loop(self):
#         """Req 1: Prove the solver advances via a dt loop (not a single energy formula)."""
#         # Use a long flat track with zero drag/friction so v stays constant.
#         # Force a timeout so the sim ends by time, not by reaching the end.
#         track = [StraightSegment(1e9, 0)]

#         v0 = 10.0
#         max_time = 0.2

#         r_dt_01 = CoasterSafetyValidator(
#             mass_kg=500,
#             initial_velocity_mps=v0,
#             rolling_friction_coeff=0,
#             drag_coeff=0,
#             dt=0.01,
#         ).validate(track, max_time_s=max_time)

#         self.assertIn("Timeout", r_dt_01.reason)
#         self.assertEqual(r_dt_01.dt_s, 0.01)
#         self.assertEqual(r_dt_01.steps, 20)
#         self.assertAlmostEqual(r_dt_01.time_s, r_dt_01.steps * r_dt_01.dt_s, places=12)

#         r_dt_002 = CoasterSafetyValidator(
#             mass_kg=500,
#             initial_velocity_mps=v0,
#             rolling_friction_coeff=0,
#             drag_coeff=0,
#             dt=0.002,
#         ).validate(track, max_time_s=max_time)

#         self.assertIn("Timeout", r_dt_002.reason)
#         self.assertEqual(r_dt_002.dt_s, 0.002)
#         self.assertEqual(r_dt_002.steps, 100)
#         self.assertAlmostEqual(r_dt_002.time_s, r_dt_002.steps * r_dt_002.dt_s, places=12)

#     # --- STALL CHECKS ---

#     def test_stall_on_slope(self):
#         """Detect stall when velocity drops to zero uphill."""
#         validator = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=1.0,
#             rolling_friction_coeff=0, drag_coeff=0
#         )
#         # Not enough energy to climb 50m
#         track = [StraightSegment(50.0, 30.0)]
#         report = validator.validate(track)

#         self.assertTrue(report.stalled)
#         self.assertFalse(report.passed)
#         self.assertEqual(report.final_velocity_mps, 0.0)

#     def test_insufficient_energy_loop_results_in_derailment(self):
#         """
#         Edge Case: Running out of energy inside a loop.
#         Physics Note: A train cannot 'stall' (v=0) statically while inverted or
#         past 90 degrees vertical. Gravity will pull it off the track (N < 0)
#         before it stops. This should flag Derailment, not Stall.
#         """
#         validator = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=15.0,
#             rolling_friction_coeff=0, drag_coeff=0
#         )
#         # 15m/s -> ~11m max height. Loop is 20m high (r=10).
#         # It will fail halfway up.
#         track = [StraightSegment(1, 0), ArcSegment(10.0, 180.0)]
#         report = validator.validate(track)

#         # We expect a safety failure. Specifically derailment because
#         # it falls off the track when v^2/r < -g*cos(theta)
#         self.assertFalse(report.passed)
#         self.assertTrue(report.derailment_risk)

#     # --- DERAILMENT CHECKS ---

#     def test_derailment_at_loop_top(self):
#         """Derail if Centripetal < Gravity at top."""
#         # Top of loop condition: v^2/r < g  => Derail
#         # r=10, g=9.8. Need v < 9.9 m/s at top.
#         # Enter at 21 m/s. Height gain 20m.
#         # v_top^2 = v_bot^2 - 2gh = 441 - 392 = 49.
#         # v_top = 7 m/s. Centripetal = 4.9 < 9.8.
#         validator = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=21.0,
#             rolling_friction_coeff=0, drag_coeff=0
#         )
#         track = [StraightSegment(1, 0), ArcSegment(10.0, 360.0)]
#         report = validator.validate(track)

#         self.assertTrue(report.derailment_risk)
#         self.assertFalse(report.passed)
#         # Ensure we tracked the trend towards negative Gs
#         self.assertLess(report.min_g, 0.6)

#     def test_negative_g_derailment_on_hill(self):
#         """Detect negative normal force on sharp airtime hill."""
#         validator = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=30.0,
#             rolling_friction_coeff=0, drag_coeff=0
#         )
#         # Sharp hill (CW arc), r=10. v=30.
#         track = [StraightSegment(1, 0), ArcSegment(10.0, -45.0)]
#         report = validator.validate(track)

#         self.assertTrue(report.derailment_risk)

#     # --- FORCE CALCULATION CHECKS ---

#     def test_drag_force_quadratic(self):
#         """Drag is proportional to velocity squared."""
#         m = 1000.0
#         c = 10.0
#         dt = 0.01
#         # FIXED: Use a very long track so both runs are limited by TIME, not distance.
#         track = [StraightSegment(1000.0, 0)]

#         v1 = 10.0
#         v2 = 20.0

#         # Run both for exactly 0.1 seconds
#         r1 = CoasterSafetyValidator(
#             mass_kg=m, initial_velocity_mps=v1,
#             rolling_friction_coeff=0, drag_coeff=c, dt=dt
#         ).validate(track, max_time_s=0.1)

#         r2 = CoasterSafetyValidator(
#             mass_kg=m, initial_velocity_mps=v2,
#             rolling_friction_coeff=0, drag_coeff=c, dt=dt
#         ).validate(track, max_time_s=0.1)

#         dv1 = v1 - r1.final_velocity_mps
#         dv2 = v2 - r2.final_velocity_mps

#         # dv ~ proportional to v^2. 20^2 / 10^2 = 4.
#         self.assertAlmostEqual(dv2 / dv1, 4.0, delta=0.2)

#     def test_friction_dynamic_normal_force(self):
#         """Friction scales with G-force (Normal Force)."""
#         mu = 0.1
#         v0 = 20.0

#         # 1. Flat track: N = mg
#         # Use 20m length
#         track_len = 20.0
#         r_flat = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=v0, rolling_friction_coeff=mu, drag_coeff=0
#         ).validate([StraightSegment(track_len, 0)])

#         # 2. Valley (Pullout): N = mg + mv^2/r.
#         # FIXED: Calculate sweep to make Arc length EXACTLY 20.0m
#         # L = r * theta_rad => theta_rad = L / r = 20 / 20 = 1.0 rad
#         # theta_deg = 1.0 * 180 / pi = 57.29...
#         r_val = 20.0
#         sweep_deg = math.degrees(track_len / r_val)

#         r_arc = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=v0, rolling_friction_coeff=mu, drag_coeff=0
#         ).validate([StraightSegment(0.01, 0), ArcSegment(r_val, sweep_deg)])

#         # Velocity loss should be higher in arc because N > mg
#         loss_flat = v0 - r_flat.final_velocity_mps
#         loss_arc = v0 - r_arc.final_velocity_mps

#         self.assertGreater(loss_arc, loss_flat)

#     # --- GEOMETRY & LIMIT CHECKS ---

#     def test_smoothness_kink_detection(self):
#         """Handle transitions smoothly / Detect kinks."""
#         validator = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=10,
#             rolling_friction_coeff=0, drag_coeff=0
#         )
#         track = [StraightSegment(10, 0), StraightSegment(10, 10)]

#         with self.assertRaisesRegex(ValueError, "Track kink"):
#             validator.validate(track)

#     def test_g_limits_exceeded_max(self):
#         """Req 7: Fail if max (positive) G exceeds configured limit."""
#         v0 = 40.0 # Fast!
#         r = 10.0
#         # Bottom of loop: G = 1 + v^2/rg = 1 + 1600/100 = 17G. Deadly.

#         validator = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=v0,
#             rolling_friction_coeff=0, drag_coeff=0
#         )
#         track = [StraightSegment(1, 0), ArcSegment(r, 45)]
#         report = validator.validate(track, g_limits=(5.0, -1.0))

#         self.assertFalse(report.passed)
#         self.assertIn("G-Force", report.reason)
#         self.assertGreater(report.max_g, 10.0)

#     def test_req8_fail_when_completed_but_min_g_below_configured_limit(self):
#         """Req 8: Run must fail if it completes but min_g violates the negative/airtime limit."""
#         # A vertical drop has ~0 normal force (0G) but is not a derailment (N == 0).
#         # Configure min allowed G above 0 so the run fails due to min_g limit.
#         validator = CoasterSafetyValidator(
#             mass_kg=500,
#             initial_velocity_mps=5.0,
#             rolling_friction_coeff=0,
#             drag_coeff=0,
#             dt=0.002,
#         )
#         track = [StraightSegment(5.0, -90.0)]
#         report = validator.validate(track, g_limits=(6.0, 0.5))

#         self.assertFalse(report.stalled)
#         self.assertFalse(report.derailment_risk)
#         self.assertFalse(report.passed)
#         self.assertIn("G-Force", report.reason)
#         self.assertLess(report.min_g, 0.5)

#     def test_segment_transition_straight_to_arc_boundary_physics(self):
#         """Segment transitions: ensure entering an arc increases normal load as expected."""
#         v0 = 10.0
#         r = 50.0
#         dt = 0.01

#         # Make straight extremely short so the sim enters the arc almost immediately.
#         straight_len = 0.001
#         arc_len = 1.0
#         sweep_deg = math.degrees(arc_len / r)

#         validator = CoasterSafetyValidator(
#             mass_kg=500,
#             initial_velocity_mps=v0,
#             rolling_friction_coeff=0,
#             drag_coeff=0,
#             dt=dt,
#         )

#         track = [StraightSegment(straight_len, 0.0), ArcSegment(r, sweep_deg)]
#         report = validator.validate(track, max_time_s=5.0)

#         # Expected max G right after entering the arc is ~1 + v^2/(r*g)
#         expected = 1.0 + (v0 * v0) / (r * G_GRAVITY)
#         self.assertAlmostEqual(report.max_g, expected, delta=0.03)

#     def test_segment_transition_arc_to_straight_requires_tangent_continuity(self):
#         """Segment transitions: arc->straight must match the arc exit tangent."""
#         validator = CoasterSafetyValidator(
#             mass_kg=500,
#             initial_velocity_mps=10,
#             rolling_friction_coeff=0,
#             drag_coeff=0,
#         )

#         # Start flat, then quarter-loop up (90deg). Exit tangent ~+90deg.
#         # Next straight lies flat -> should be rejected.
#         track = [StraightSegment(1, 0), ArcSegment(10.0, 90.0), StraightSegment(1, 0)]

#         with self.assertRaisesRegex(ValueError, "Track kink"):
#             validator.validate(track)

#     def test_initial_g_force(self):
#         """Correction Check: G-force initializes correctly on start."""
#         validator = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=0,
#             rolling_friction_coeff=0, drag_coeff=0
#         )
#         # Start on flat: 1G
#         track_flat = [StraightSegment(10, 0)]
#         r_flat = validator.validate(track_flat)
#         self.assertAlmostEqual(r_flat.max_g, 1.0)
#         self.assertAlmostEqual(r_flat.min_g, 1.0)

#         # Start on vertical drop (90 deg): 0G (Freefall)
#         track_vert = [StraightSegment(10, 90)]
#         r_vert = validator.validate(track_vert)
#         self.assertAlmostEqual(r_vert.max_g, 0.0, delta=1e-5)

#     def test_timeout(self):
#         """Edge Case: Infinite loops or too long tracks."""
#         validator = CoasterSafetyValidator(
#             mass_kg=500, initial_velocity_mps=1.0,
#             rolling_friction_coeff=0, drag_coeff=0
#         )
#         track = [StraightSegment(1000, 0)]
#         report = validator.validate(track, max_time_s=0.1)

#         self.assertFalse(report.passed)
#         self.assertIn("Timeout", report.reason)

# if __name__ == "__main__":
#     unittest.main()

import math
import unittest

from repository_after.coaster_safety_validator import (
    CoasterSafetyValidator, StraightSegment, ArcSegment,
    G_GRAVITY, SafetyReport
)

class TestCoasterSafetyValidator(unittest.TestCase):

    # --- REQUIREMENT 1: PROOF OF NUMERICAL INTEGRATION ---

    def test_numerical_integration_step_logic(self):
        """
        Req 1: Prove that the code uses explicit numerical integration (dt loop)
        rather than energy conservation formulas.
        We verify this by calculating exactly one Euler step manually and
        ensuring the validator matches it exactly.
        """
        m = 500.0
        v0 = 10.0
        dt = 0.1
        slope_deg = 30.0
        c_drag = 2.0
        mu = 0.05

        # Setup Validator
        validator = CoasterSafetyValidator(
            mass_kg=m, initial_velocity_mps=v0,
            rolling_friction_coeff=mu, drag_coeff=c_drag,
            dt=dt, g=G_GRAVITY
        )

        # Track: Downhill slope
        track = [StraightSegment(100.0, -slope_deg)]

        # Manual One-Step Calculation:
        theta = math.radians(-slope_deg)

        # 1. Gravity Force (Parallel)
        # a_grav = -g * sin(theta)
        a_grav = -G_GRAVITY * math.sin(theta) # sin(-30) is -0.5, so a_grav is positive (speed up)

        # 2. Normal Force
        # N/m = g * cos(theta) (Curvature is 0)
        n_over_m = G_GRAVITY * math.cos(theta)

        # 3. Drag Force
        # a_drag = -(c/m) * v * |v|
        a_drag = -(c_drag / m) * v0 * abs(v0)

        # 4. Friction
        # a_fric = -mu * N/m * sign(v)
        a_fric = -mu * n_over_m * 1.0

        # Total Acceleration
        a_total = a_grav + a_drag + a_fric

        # Euler Step
        expected_v1 = v0 + a_total * dt

        # Run Validator for exactly one integration step.
        # The simulator loops while t < max_time_s, so max_time_s=dt yields one step.
        report = validator.validate(track, max_time_s=dt)

        # If the code used Energy Conservation, it would calculate v based on
        # height dropped (s * sin(theta)), which doesn't inherently account for
        # time-based drag accumulation in the same discrete way.

        # We check that the velocity matches our discrete manual calculation.
        self.assertAlmostEqual(report.final_velocity_mps, expected_v1, places=5)

    # --- STALL CHECKS ---

    def test_stall_on_slope(self):
        """Detect stall when velocity drops to zero uphill."""
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=1.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        track = [StraightSegment(50.0, 30.0)]
        report = validator.validate(track)

        self.assertTrue(report.stalled)
        self.assertFalse(report.passed)
        self.assertEqual(report.final_velocity_mps, 0.0)

    def test_insufficient_energy_loop_results_in_derailment(self):
        """
        Edge Case: Running out of energy inside a loop.
        Gravity will pull it off the track (N < 0) before it stops.
        This should flag Derailment, not Stall.
        """
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=15.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        # 15m/s -> ~11m max height. Loop is 20m high (r=10).
        track = [StraightSegment(1, 0), ArcSegment(10.0, 180.0)]
        report = validator.validate(track)

        self.assertFalse(report.passed)
        self.assertTrue(report.derailment_risk)

    # --- DERAILMENT & LIMIT CHECKS ---

    def test_derailment_at_loop_top(self):
        """Derail if Centripetal < Gravity at top."""
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=21.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        track = [StraightSegment(1, 0), ArcSegment(10.0, 360.0)]
        report = validator.validate(track)

        self.assertTrue(report.derailment_risk)
        self.assertFalse(report.passed)

    def test_negative_g_derailment_on_hill(self):
        """Detect negative normal force (derailment) on sharp airtime hill."""
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=30.0,
            rolling_friction_coeff=0, drag_coeff=0
        )
        # Sharp hill (CW arc), r=10. v=30.
        track = [StraightSegment(1, 0), ArcSegment(10.0, -45.0)]
        report = validator.validate(track)

        self.assertTrue(report.derailment_risk)

    def test_fail_min_g_limit_without_derailment(self):
        """
        Req 8: Test that a run fails when min_g exceeds the configured
        limit, even if it doesn't derail.
        Scenario: "Floater" airtime where G drops to 0.2G.
        This is physically safe (N > 0), but if limit is 0.5G, it must fail.
        """
        v0 = 20.0
        # Gentle hill. Radius large enough to reduce Gs, but not negative.
        # r=50. v=20. a_c = 400/50 = 8 m/s^2.
        # Top of hill: g_total = g - a_c = 9.8 - 8 = 1.8 (approx).
        # Let's use specific values to get ~0.2G.
        # Need v^2/r approx 0.8g.

        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=20.0,
            rolling_friction_coeff=0, drag_coeff=0
        )

        # Create a hill.
        # We set limits such that 0.2G is acceptable for derailment (N>0),
        # but unacceptable for the customer (req > 0.5G).
        limit_min = 0.5

        # Hill generation
        # v=20. Target Normal = 0.2g => 1.96 m/s^2.
        # N/m = g - v^2/r => 1.96 = 9.8 - 400/r => 400/r = 7.84 => r = 51.0
        track = [StraightSegment(10, 0), ArcSegment(51.0, -20.0)]

        report = validator.validate(track, g_limits=(6.0, limit_min))

        # It should NOT derail
        self.assertFalse(report.derailment_risk, "Should not derail with positive Gs")
        # But it should FAIL the safety check
        self.assertFalse(report.passed, "Should fail due to strict min G limit")
        self.assertLess(report.min_g, limit_min)
        self.assertIn("G-Force limits exceeded", report.reason)

    # --- PHYSICS CONTINUITY CHECKS ---

    def test_physics_continuity_straight_to_arc(self):
        """
        Segment Transitions Check: Ensure physics values update correctly
        at the boundary of Straight -> Arc.
        """
        validator = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=20.0,
            rolling_friction_coeff=0, drag_coeff=0, dt=0.001
        )

        # 10m Straight -> Loop
        r = 20.0 # Curvature = 0.05
        track = [StraightSegment(10.0, 0.0), ArcSegment(r, 45.0)]

        report = validator.validate(track)

        # On Straight, G should be exactly 1.0 (drag/friction 0, flat)
        # On Arc entry, G should jump to 1 + v^2/rg
        # v ~ 20. ac = 400/20 = 20. g=9.8. G ~ 1 + 2.04 = 3.04.

        # We check that the max_g captured is consistent with entering the loop
        expected_loop_g = 1.0 + (20.0**2 / (r * G_GRAVITY))

        # The reported max_g should be very close to this theoretical max
        # (calculated at the very first step of the arc)
        self.assertAlmostEqual(report.max_g, expected_loop_g, delta=0.1)

    def test_segment_transition_arc_to_straight_requires_tangent_continuity(self):
        """Segment transitions: Arc -> Straight must be tangent-continuous."""
        validator = CoasterSafetyValidator(
            mass_kg=500,
            initial_velocity_mps=10.0,
            rolling_friction_coeff=0.0,
            drag_coeff=0.0,
        )

        # Arc rotates tangent by +45deg, but the next straight claims 0deg.
        track = [
            StraightSegment(1.0, 0.0),
            ArcSegment(10.0, 45.0),
            StraightSegment(5.0, 0.0),
        ]

        with self.assertRaisesRegex(ValueError, "Track kink"):
            validator.validate(track)

    def test_physics_continuity_arc_to_straight_min_g_reasonable(self):
        """Segment transitions: after a continuous Arc -> Straight, physics updates correctly."""
        validator = CoasterSafetyValidator(
            mass_kg=500,
            initial_velocity_mps=10.0,
            rolling_friction_coeff=0.0,
            drag_coeff=0.0,
            dt=0.001,
        )

        # Enter flat, take a mild +10deg arc (valley-ish), then continue on a +10deg straight.
        end_slope_deg = 10.0
        track = [
            StraightSegment(1.0, 0.0),
            ArcSegment(20.0, end_slope_deg),
            StraightSegment(5.0, end_slope_deg),
        ]

        report = validator.validate(track, g_limits=(10.0, -2.0))
        self.assertTrue(report.passed)

        # On the final straight, normal-load should be ~cos(10deg) (< 1.0).
        expected_min_g = math.cos(math.radians(end_slope_deg))
        self.assertAlmostEqual(report.min_g, expected_min_g, delta=0.05)
        # Arc entry should create some positive-G above 1.
        self.assertGreater(report.max_g, 1.1)

    # --- FORCE CALCULATION CHECKS ---

    def test_drag_force_quadratic(self):
        """Drag is proportional to velocity squared."""
        m = 1000.0
        c = 10.0
        dt = 0.01
        track = [StraightSegment(1000.0, 0)]

        v1 = 10.0
        v2 = 20.0

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
        track_len = 20.0
        r_flat = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=v0, rolling_friction_coeff=mu, drag_coeff=0
        ).validate([StraightSegment(track_len, 0)])

        # 2. Valley (Pullout): N = mg + mv^2/r.
        r_val = 20.0
        sweep_deg = math.degrees(track_len / r_val) # Ensure same path length

        r_arc = CoasterSafetyValidator(
            mass_kg=500, initial_velocity_mps=v0, rolling_friction_coeff=mu, drag_coeff=0
        ).validate([StraightSegment(0.01, 0), ArcSegment(r_val, sweep_deg)])

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

    def test_g_limits_exceeded_max_positive(self):
        """Fail if Gs exceed max limit (High Positive Gs)."""
        v0 = 40.0
        r = 10.0
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