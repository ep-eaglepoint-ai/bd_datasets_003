from __future__ import annotations

import math
from dataclasses import dataclass
from math import cos, pi, sin, copysign
from typing import List, Sequence, Tuple, Union

# ==========================================
#  Physics Constants & Configuration
# ==========================================

G_GRAVITY = 9.80665
STALL_THRESHOLD_MPS = 1e-4      # Effectively zero velocity
DERAIL_TOLERANCE = -1e-7        # Robust "below zero" check handling float jitter
SMOOTHNESS_TOLERANCE_RAD = 1e-4 # Max allowable kink angle

@dataclass(frozen=True, slots=True)
class StraightSegment:
    """A straight track segment."""
    length_m: float
    slope_degrees: float

@dataclass(frozen=True, slots=True)
class ArcSegment:
    """
    A constant curvature arc segment.
    radius_m: Must be > 0
    sweep_degrees: Positive = CCW (Valley/Loop bottom), Negative = CW (Hill/Crest)
    """
    radius_m: float
    sweep_degrees: float

TrackSegment = Union[StraightSegment, ArcSegment]

@dataclass(frozen=True, slots=True)
class SafetyReport:
    max_g: float
    min_g: float
    max_velocity_mps: float
    final_velocity_mps: float
    time_s: float
    distance_m: float
    passed: bool
    stalled: bool
    derailment_risk: bool
    reason: str

@dataclass(frozen=True, slots=True)
class _SimSegment:
    """Optimized internal segment representation."""
    length: float
    start_s: float
    end_s: float
    theta_start_rad: float
    curvature: float  # k = 1/r (Signed)

class CoasterSafetyValidator:
    """
    Time-domain physics engine for roller coaster safety certification.
    """

    def __init__(
        self,
        *,
        mass_kg: float,
        initial_velocity_mps: float,
        rolling_friction_coeff: float,
        drag_coeff: float,
        dt: float = 0.002,
        g: float = G_GRAVITY,
    ) -> None:
        if mass_kg <= 0: raise ValueError("Mass must be > 0")
        if initial_velocity_mps < 0: raise ValueError("Velocity must be >= 0")
        if dt <= 0: raise ValueError("dt must be > 0")
        if rolling_friction_coeff < 0 or drag_coeff < 0: raise ValueError("Coefficients must be >= 0")

        self._m = float(mass_kg)
        self._v0 = float(initial_velocity_mps)
        self._mu = float(rolling_friction_coeff)
        self._c_drag = float(drag_coeff)
        self._dt = float(dt)
        self._g = float(g)

    def validate(
        self,
        track: Sequence[TrackSegment],
        *,
        max_time_s: float = 300.0,
        g_limits: Tuple[float, float] = (6.0, -1.5),
    ) -> SafetyReport:
        if not track: raise ValueError("Track must not be empty")

        # 1. Compile Track & Check Smoothness
        segments, total_length = self._compile_track(track)

        # 2. Initialize State
        s = 0.0
        v = self._v0
        t = 0.0

        # 3. Initialize Metrics
        # Calculate initial G-force at s=0 (Static + Centripetal if v0>0 on curve)
        # Note: curvature at s=0 is segments[0].curvature
        k0 = segments[0].curvature
        theta0 = segments[0].theta_start_rad

        # Initial Normal Force Calculation
        n0_over_m = (v**2 * k0) + self._g * cos(theta0)
        initial_g = n0_over_m / self._g

        max_v = v
        max_g = initial_g
        min_g = initial_g

        stalled = False
        derailment = False
        reason = "OK"

        seg_idx = 0
        current_seg = segments[0]
        max_g_allowed, min_g_allowed = g_limits

        # 4. Simulation Loop
        while t < max_time_s:
            # --- A. Spatial Query (O(1)) ---
            while s >= current_seg.end_s:
                if seg_idx < len(segments) - 1:
                    seg_idx += 1
                    current_seg = segments[seg_idx]
                else:
                    break

            if s >= total_length:
                break # Course Complete

            # --- B. Geometry ---
            ds = s - current_seg.start_s
            theta = current_seg.theta_start_rad + (current_seg.curvature * ds)

            # --- C. Normal Force Calculation ---
            # Prompt: "Normal Force equals Mass times sum of Gravity and Centripetal"
            # Formula: N/m = v^2/r + g*cos(theta)
            # Note: k (curvature) contains the 1/r and the sign convention.
            centripetal_accel = (v * v) * current_seg.curvature
            gravity_normal_accel = self._g * cos(theta)

            n_over_m = centripetal_accel + gravity_normal_accel

            # Update G-Force Metrics
            current_g = n_over_m / self._g
            if current_g > max_g: max_g = current_g
            if current_g < min_g: min_g = current_g

            # --- D. Derailment Check ---
            # Prompt: "If Normal Force drops below zero... flag Derailment Risk"
            # Use small epsilon tolerance for float stability
            if n_over_m < DERAIL_TOLERANCE:
                derailment = True
                reason = "Derailment Risk: Normal Force dropped below zero"
                break

            # --- E. Tangential Forces ---
            # 1. Gravity Parallel: -g * sin(theta)
            a_grav = -self._g * sin(theta)

            # 2. Aerodynamic Drag: -c * v^2
            a_drag = -(self._c_drag / self._m) * v * abs(v)

            # 3. Rolling Friction: -mu * N
            # Prompt: "friction... multiplied by the Normal Force, which varies dynamically"
            # We clamp N to 0 because physically friction cannot exist if wheels detach (N<0).
            # Although we fail on N<0, this clamping handles the floating point edge case
            # where N is -1e-10 (technically valid per tolerance) but shouldn't generate reverse friction.
            n_clamped = max(0.0, n_over_m)
            a_fric = -self._mu * n_clamped * copysign(1.0, v)

            a_total = a_grav + a_drag + a_fric

            # --- F. Integration ---
            v_new = v + a_total * self._dt

            if v_new > max_v: max_v = v_new

            # Stall Check
            # Prompt: "Stalls where the velocity drops to zero or below"
            if v_new <= STALL_THRESHOLD_MPS:
                stalled = True
                reason = "Stall: Velocity dropped to zero"
                v = 0.0
                break

            v = v_new
            s += v * self._dt
            t += self._dt

        # 5. Final Report Generation
        completed = (s >= total_length) and not stalled and not derailment

        if t >= max_time_s and not completed:
            reason = "Timeout: Max simulation time exceeded"

        # Check G-Limits
        within_limits = (min_g >= min_g_allowed) and (max_g <= max_g_allowed)

        passed = completed and within_limits

        if completed and not within_limits:
            reason = f"G-Force limits exceeded (Max: {max_g:.2f}, Min: {min_g:.2f})"

        return SafetyReport(
            max_g=max_g,
            min_g=min_g,
            max_velocity_mps=max_v,
            final_velocity_mps=v,
            time_s=t,
            distance_m=min(s, total_length),
            passed=passed,
            stalled=stalled,
            derailment_risk=derailment,
            reason=reason
        )

    def _compile_track(self, track: Sequence[TrackSegment]) -> Tuple[List[_SimSegment], float]:
        compiled = []
        s_cursor = 0.0

        # We need an initial tangent.
        # If the first segment is an Arc, the user must define the entry angle via logic
        # or we enforce a Straight segment first.
        # To be safe and explicit based on prompt implying "track layout":
        if not isinstance(track[0], StraightSegment):
            raise ValueError("Track must start with a StraightSegment to define entry tangent.")

        current_theta = math.radians(track[0].slope_degrees)

        for i, seg in enumerate(track):
            # Check Smoothness (Transition from Previous)
            if i > 0:
                # Calculate entry angle for this segment based on its type
                # But wait, our logic CALCULATES the entry angle based on the previous exit.
                # However, if we have two straight segments joined:
                # Straight(0 deg) -> Straight(10 deg) -> KINK.
                if isinstance(seg, StraightSegment):
                    target_theta = math.radians(seg.slope_degrees)
                    delta = abs(self._wrap_angle(target_theta - current_theta))
                    if delta > SMOOTHNESS_TOLERANCE_RAD:
                        raise ValueError(f"Track kink at segment {i}. Expected angle {math.degrees(current_theta):.2f}, got {math.degrees(target_theta):.2f}")
                    # If smooth, we adopt the straight segment's exact angle to prevent float drift
                    current_theta = target_theta

                # If ArcSegment, it starts at whatever angle we are currently at (Tangent continuity).
                # No check needed for Arc entry, it inherently continues the tangent.

            if isinstance(seg, StraightSegment):
                length = float(seg.length_m)
                slope_rad = math.radians(seg.slope_degrees)

                compiled.append(_SimSegment(
                    length=length,
                    start_s=s_cursor,
                    end_s=s_cursor + length,
                    theta_start_rad=slope_rad,
                    curvature=0.0
                ))
                current_theta = slope_rad
                s_cursor += length

            elif isinstance(seg, ArcSegment):
                r = float(seg.radius_m)
                deg = float(seg.sweep_degrees)
                if r <= 0: raise ValueError("Radius must be positive")

                rad = math.radians(deg)
                length = abs(r * rad)

                # Curvature convention:
                # +Sweep (CCW) -> +k (Valley)
                # -Sweep (CW) -> -k (Hill)
                k = (1.0 / r) if rad > 0 else (-1.0 / r)

                compiled.append(_SimSegment(
                    length=length,
                    start_s=s_cursor,
                    end_s=s_cursor + length,
                    theta_start_rad=current_theta,
                    curvature=k
                ))
                current_theta += rad # Rotate tangent
                s_cursor += length
            else:
                raise TypeError(f"Unknown segment type: {type(seg)}")

        return compiled, s_cursor

    @staticmethod
    def _wrap_angle(angle: float) -> float:
        """Wrap angle to [-pi, pi]."""
        return (angle + pi) % (2 * pi) - pi