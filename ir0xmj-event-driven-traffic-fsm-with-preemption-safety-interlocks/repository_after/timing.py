"""
Timing configuration for the Traffic Signal Controller.

Defines configurable timing parameters for signal phases.
"""

from dataclasses import dataclass


@dataclass
class SignalTiming:
    """Timing configuration for the traffic signal system."""
    min_green_time: float = 5.0       # Minimum green duration (Dilemma Zone protection)
    max_green_time: float = 30.0      # Maximum green duration (prevents starvation)
    yellow_time: float = 3.0          # Fixed yellow duration
    all_red_time: float = 2.0         # Fixed all-red clearance interval
    extension_per_vehicle: float = 2.0  # Green extension per detected vehicle
