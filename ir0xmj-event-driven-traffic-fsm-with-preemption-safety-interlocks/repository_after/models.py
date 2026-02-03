"""
Data models for the Traffic Signal Controller.

Defines data structures for road state and controller state snapshots.
"""

from dataclasses import dataclass
from typing import Optional

from states import SignalState, ControllerPhase


@dataclass
class RoadState:
    """State information for a single road."""
    signal: SignalState = SignalState.RED
    density: float = 0.0  # Vehicle density (0.0 to 1.0)


@dataclass
class ControllerState:
    """Complete state snapshot of the controller."""
    phase: ControllerPhase
    main_signal: SignalState
    side_signal: SignalState
    main_density: float
    side_density: float
    emergency_active: bool
    emergency_road: Optional[str]  # 'main' or 'side'
    phase_start_time: float
    phase_elapsed: float
