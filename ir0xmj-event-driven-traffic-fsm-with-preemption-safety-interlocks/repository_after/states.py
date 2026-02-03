"""
State enums for the Traffic Signal FSM.

Defines the possible states for traffic signals and controller phases.
"""

from enum import Enum, auto


class SignalState(Enum):
    """Traffic signal states for each road."""
    RED = auto()
    GREEN = auto()
    YELLOW = auto()
    ALL_RED = auto()  # Clearance interval


class ControllerPhase(Enum):
    """Controller operational phases."""
    MAIN_GREEN = auto()
    MAIN_YELLOW = auto()
    MAIN_TO_SIDE_ALL_RED = auto()
    SIDE_GREEN = auto()
    SIDE_YELLOW = auto()
    SIDE_TO_MAIN_ALL_RED = auto()
    EMERGENCY_TRANSITION_YELLOW = auto()
    EMERGENCY_TRANSITION_ALL_RED = auto()
    EMERGENCY_ACTIVE = auto()
    EMERGENCY_EXIT_YELLOW = auto()
    EMERGENCY_EXIT_ALL_RED = auto()
