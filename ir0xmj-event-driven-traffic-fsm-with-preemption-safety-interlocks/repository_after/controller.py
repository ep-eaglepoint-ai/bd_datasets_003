"""
Event-Driven Traffic FSM with Preemption & Safety Interlocks

This module implements an AdaptiveSignalController class that manages traffic signal
state transitions for two intersecting roads (Main and Side) based on real-time
sensor density and emergency override signals.

Key Features:
- Strict phase sequence: Green -> Yellow -> All-Red -> Red
- Conflicting Phase Guard: No simultaneous Green/Yellow on both roads
- Dilemma Zone protection: Minimum green time enforcement
- Emergency preemption with safe transition
- Thread-safe sensor updates
- Event-driven FSM architecture
"""

import threading
import time
from typing import Optional, Callable
import logging

from states import SignalState, ControllerPhase
from timing import SignalTiming
from models import RoadState, ControllerState

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
    

class AdaptiveSignalController:
    """
    Thread-safe traffic signal controller implementing an event-driven FSM
    with preemption and safety interlocks.
    
    Safety Constraints:
    1. Conflicting Phase Guard: Main and Side cannot both be Green/Yellow
    2. All-Red clearance interval between any phase handover
    3. Dilemma Zone protection: Minimum green time enforced
    4. Safe emergency transitions via Yellow -> All-Red sequence
    """
    
    def __init__(self, timing: Optional[SignalTiming] = None):
        """Initialize the controller with optional timing configuration."""
        self.timing = timing or SignalTiming()
        
        # Road states
        self._main = RoadState(signal=SignalState.GREEN)
        self._side = RoadState(signal=SignalState.RED)
        
        # Controller state
        self._phase = ControllerPhase.MAIN_GREEN
        self._phase_start_time = time.time()
        self._green_extended_until: Optional[float] = None
        
        # Emergency state
        self._emergency_active = False
        self._emergency_road: Optional[str] = None
        self._pre_emergency_phase: Optional[ControllerPhase] = None
        self._pending_road_after_emergency: Optional[str] = None
        
        # Thread safety
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._phase_change_event = threading.Event()
        
        # State change callback
        self._state_change_callback: Optional[Callable[[ControllerState], None]] = None
        
        # Worker thread
        self._worker_thread: Optional[threading.Thread] = None
        self._running = False
        
    def start(self) -> None:
        """Start the controller's event loop."""
        with self._lock:
            if self._running:
                return
            self._running = True
            self._stop_event.clear()
            self._phase_start_time = time.time()
            self._worker_thread = threading.Thread(target=self._run_loop, daemon=True)
            self._worker_thread.start()
            
    def stop(self) -> None:
        """Stop the controller's event loop."""
        with self._lock:
            if not self._running:
                return
            self._running = False
            self._stop_event.set()
            self._phase_change_event.set()
        
        if self._worker_thread:
            self._worker_thread.join(timeout=5.0)
            self._worker_thread = None
            
    def update_density(self, road: str, density: float) -> None:
        """
        Thread-safe update of traffic density for a road.
        
        Args:
            road: 'main' or 'side'
            density: Vehicle density (0.0 to 1.0)
        """
        density = max(0.0, min(1.0, density))
        
        with self._lock:
            if road == 'main':
                self._main.density = density
            elif road == 'side':
                self._side.density = density
            else:
                raise ValueError(f"Invalid road: {road}. Must be 'main' or 'side'")
            
            # Signal the worker thread to re-evaluate
            self._phase_change_event.set()
            
    def trigger_emergency(self, road: str) -> None:
        """
        Trigger emergency vehicle preemption.
        
        The controller will safely transition the current phase to Red
        (via Yellow -> All-Red) before activating emergency Green for
        the specified road.
        
        Args:
            road: 'main' or 'side' - the road requiring emergency access
        """
        with self._lock:
            if self._emergency_active:
                # Already in emergency mode
                if self._emergency_road == road:
                    return  # Same road, no change needed
                # Different road emergency - will handle after current clears
                self._emergency_road = road
                return
                
            self._emergency_active = True
            self._emergency_road = road
            
            # Store current phase for potential resume
            self._pre_emergency_phase = self._phase
            
            # Determine pending road based on traffic density
            if self._main.density >= self._side.density:
                self._pending_road_after_emergency = 'main'
            else:
                self._pending_road_after_emergency = 'side'
            
            # Start emergency transition
            self._start_emergency_transition()
            
            self._phase_change_event.set()
            
    def clear_emergency(self) -> None:
        """
        Clear the emergency signal and resume normal operation.
        
        The controller will safely transition out of emergency mode
        (via Yellow -> All-Red) before resuming normal cycle.
        """
        with self._lock:
            if not self._emergency_active:
                return
                
            # Mark emergency as no longer active, but don't immediately change phase
            # The FSM will handle the safe transition
            self._emergency_active = False
            
            # Start exit transition from emergency
            if self._phase == ControllerPhase.EMERGENCY_ACTIVE:
                self._phase = ControllerPhase.EMERGENCY_EXIT_YELLOW
                self._phase_start_time = time.time()
                
                # Set the emergency road to Yellow
                if self._emergency_road == 'main':
                    self._main.signal = SignalState.YELLOW
                else:
                    self._side.signal = SignalState.YELLOW
                    
            self._phase_change_event.set()
            
    def get_current_state(self) -> ControllerState:
        """
        Get the current state snapshot for hardware driver polling.
        
        Returns:
            ControllerState with all current signal and phase information
        """
        with self._lock:
            now = time.time()
            return ControllerState(
                phase=self._phase,
                main_signal=self._main.signal,
                side_signal=self._side.signal,
                main_density=self._main.density,
                side_density=self._side.density,
                emergency_active=self._emergency_active or self._phase in (
                    ControllerPhase.EMERGENCY_TRANSITION_YELLOW,
                    ControllerPhase.EMERGENCY_TRANSITION_ALL_RED,
                    ControllerPhase.EMERGENCY_ACTIVE,
                    ControllerPhase.EMERGENCY_EXIT_YELLOW,
                    ControllerPhase.EMERGENCY_EXIT_ALL_RED,
                ),
                emergency_road=self._emergency_road,
                phase_start_time=self._phase_start_time,
                phase_elapsed=now - self._phase_start_time,
            )
            
    def set_state_change_callback(self, callback: Callable[[ControllerState], None]) -> None:
        """Set a callback to be called on state changes."""
        with self._lock:
            self._state_change_callback = callback
            
    def _start_emergency_transition(self) -> None:
        """Begin safe transition to emergency mode."""
        # Determine which road is currently Green/Yellow and needs to transition
        if self._phase in (ControllerPhase.MAIN_GREEN, ControllerPhase.MAIN_YELLOW):
            # Main is active, transition it to Red
            if self._phase == ControllerPhase.MAIN_GREEN:
                self._main.signal = SignalState.YELLOW
            self._phase = ControllerPhase.EMERGENCY_TRANSITION_YELLOW
        elif self._phase in (ControllerPhase.SIDE_GREEN, ControllerPhase.SIDE_YELLOW):
            # Side is active, transition it to Red
            if self._phase == ControllerPhase.SIDE_GREEN:
                self._side.signal = SignalState.YELLOW
            self._phase = ControllerPhase.EMERGENCY_TRANSITION_YELLOW
        elif self._phase in (ControllerPhase.MAIN_TO_SIDE_ALL_RED, ControllerPhase.SIDE_TO_MAIN_ALL_RED):
            # Already in All-Red, can go directly to emergency transition All-Red
            self._phase = ControllerPhase.EMERGENCY_TRANSITION_ALL_RED
        else:
            # Already in emergency transition
            pass
            
        self._phase_start_time = time.time()
        
    def _run_loop(self) -> None:
        """Main event loop for the FSM."""
        while not self._stop_event.is_set():
            # Wait for phase change event or timeout
            timeout = self._calculate_next_timeout()
            self._phase_change_event.wait(timeout=timeout)
            self._phase_change_event.clear()
            
            if self._stop_event.is_set():
                break
                
            with self._lock:
                self._process_phase_transition()
                
    def _calculate_next_timeout(self) -> float:
        """Calculate timeout until next potential state change."""
        with self._lock:
            elapsed = time.time() - self._phase_start_time
            
            if self._phase in (ControllerPhase.MAIN_GREEN, ControllerPhase.SIDE_GREEN):
                # Green phase - check for extension or max time
                remaining_min = max(0, self.timing.min_green_time - elapsed)
                remaining_max = max(0, self.timing.max_green_time - elapsed)
                
                if remaining_min > 0:
                    return min(remaining_min, 0.1)  # Check frequently during min green
                return min(remaining_max, 0.1)
                
            elif self._phase in (ControllerPhase.MAIN_YELLOW, ControllerPhase.SIDE_YELLOW,
                                 ControllerPhase.EMERGENCY_TRANSITION_YELLOW,
                                 ControllerPhase.EMERGENCY_EXIT_YELLOW):
                remaining = max(0, self.timing.yellow_time - elapsed)
                return remaining if remaining > 0 else 0.01
                
            elif self._phase in (ControllerPhase.MAIN_TO_SIDE_ALL_RED, 
                                 ControllerPhase.SIDE_TO_MAIN_ALL_RED,
                                 ControllerPhase.EMERGENCY_TRANSITION_ALL_RED,
                                 ControllerPhase.EMERGENCY_EXIT_ALL_RED):
                remaining = max(0, self.timing.all_red_time - elapsed)
                return remaining if remaining > 0 else 0.01
                
            elif self._phase == ControllerPhase.EMERGENCY_ACTIVE:
                # Stay in emergency until cleared
                return 1.0
                
            return 0.1
            
    def _process_phase_transition(self) -> None:
        """Process state transitions based on current phase and elapsed time."""
        now = time.time()
        elapsed = now - self._phase_start_time
        
        old_phase = self._phase
        
        # Handle each phase
        if self._phase == ControllerPhase.MAIN_GREEN:
            self._handle_main_green(elapsed)
        elif self._phase == ControllerPhase.MAIN_YELLOW:
            self._handle_main_yellow(elapsed)
        elif self._phase == ControllerPhase.MAIN_TO_SIDE_ALL_RED:
            self._handle_main_to_side_all_red(elapsed)
        elif self._phase == ControllerPhase.SIDE_GREEN:
            self._handle_side_green(elapsed)
        elif self._phase == ControllerPhase.SIDE_YELLOW:
            self._handle_side_yellow(elapsed)
        elif self._phase == ControllerPhase.SIDE_TO_MAIN_ALL_RED:
            self._handle_side_to_main_all_red(elapsed)
        elif self._phase == ControllerPhase.EMERGENCY_TRANSITION_YELLOW:
            self._handle_emergency_transition_yellow(elapsed)
        elif self._phase == ControllerPhase.EMERGENCY_TRANSITION_ALL_RED:
            self._handle_emergency_transition_all_red(elapsed)
        elif self._phase == ControllerPhase.EMERGENCY_ACTIVE:
            self._handle_emergency_active()
        elif self._phase == ControllerPhase.EMERGENCY_EXIT_YELLOW:
            self._handle_emergency_exit_yellow(elapsed)
        elif self._phase == ControllerPhase.EMERGENCY_EXIT_ALL_RED:
            self._handle_emergency_exit_all_red(elapsed)
            
        # Notify callback if state changed
        if self._phase != old_phase and self._state_change_callback:
            self._state_change_callback(self.get_current_state())
            
    def _should_extend_green(self, current_road: str) -> bool:
        """Check if green should be extended based on traffic density."""
        density = self._main.density if current_road == 'main' else self._side.density
        opposite_density = self._side.density if current_road == 'main' else self._main.density
        
        # Extend if there's traffic and opposite road isn't starving
        elapsed = time.time() - self._phase_start_time
        if elapsed >= self.timing.max_green_time:
            return False  # Max time reached, must switch
            
        # If opposite road has waiting traffic, don't extend indefinitely
        if opposite_density > 0 and elapsed >= self.timing.min_green_time:
            # Give some priority to heavily loaded roads
            if density > opposite_density * 2:
                return elapsed < self.timing.max_green_time * 0.8
            return False
            
        return density > 0
        
    def _handle_main_green(self, elapsed: float) -> None:
        """Handle MAIN_GREEN phase logic."""
        # Dilemma Zone protection: Must stay green for min_green_time
        if elapsed < self.timing.min_green_time:
            return
            
        # Check if we should transition to yellow
        if elapsed >= self.timing.max_green_time:
            # Max time reached, must transition
            self._transition_to_main_yellow()
        elif not self._should_extend_green('main'):
            # Traffic conditions warrant transition
            self._transition_to_main_yellow()
            
    def _transition_to_main_yellow(self) -> None:
        """Transition from MAIN_GREEN to MAIN_YELLOW."""
        self._main.signal = SignalState.YELLOW
        self._phase = ControllerPhase.MAIN_YELLOW
        self._phase_start_time = time.time()
        
    def _handle_main_yellow(self, elapsed: float) -> None:
        """Handle MAIN_YELLOW phase logic."""
        if elapsed >= self.timing.yellow_time:
            self._transition_to_main_to_side_all_red()
            
    def _transition_to_main_to_side_all_red(self) -> None:
        """Transition from MAIN_YELLOW to ALL_RED clearance."""
        self._main.signal = SignalState.ALL_RED
        self._side.signal = SignalState.ALL_RED
        self._phase = ControllerPhase.MAIN_TO_SIDE_ALL_RED
        self._phase_start_time = time.time()
        
    def _handle_main_to_side_all_red(self, elapsed: float) -> None:
        """Handle ALL_RED clearance interval (Main -> Side)."""
        if elapsed >= self.timing.all_red_time:
            self._transition_to_side_green()
            
    def _transition_to_side_green(self) -> None:
        """Transition to SIDE_GREEN after ALL_RED clearance."""
        self._main.signal = SignalState.RED
        self._side.signal = SignalState.GREEN
        self._phase = ControllerPhase.SIDE_GREEN
        self._phase_start_time = time.time()
        
    def _handle_side_green(self, elapsed: float) -> None:
        """Handle SIDE_GREEN phase logic."""
        # Dilemma Zone protection: Must stay green for min_green_time
        if elapsed < self.timing.min_green_time:
            return
            
        # Check if we should transition to yellow
        if elapsed >= self.timing.max_green_time:
            # Max time reached, must transition
            self._transition_to_side_yellow()
        elif not self._should_extend_green('side'):
            # Traffic conditions warrant transition
            self._transition_to_side_yellow()
            
    def _transition_to_side_yellow(self) -> None:
        """Transition from SIDE_GREEN to SIDE_YELLOW."""
        self._side.signal = SignalState.YELLOW
        self._phase = ControllerPhase.SIDE_YELLOW
        self._phase_start_time = time.time()
        
    def _handle_side_yellow(self, elapsed: float) -> None:
        """Handle SIDE_YELLOW phase logic."""
        if elapsed >= self.timing.yellow_time:
            self._transition_to_side_to_main_all_red()
            
    def _transition_to_side_to_main_all_red(self) -> None:
        """Transition from SIDE_YELLOW to ALL_RED clearance."""
        self._main.signal = SignalState.ALL_RED
        self._side.signal = SignalState.ALL_RED
        self._phase = ControllerPhase.SIDE_TO_MAIN_ALL_RED
        self._phase_start_time = time.time()
        
    def _handle_side_to_main_all_red(self, elapsed: float) -> None:
        """Handle ALL_RED clearance interval (Side -> Main)."""
        if elapsed >= self.timing.all_red_time:
            self._transition_to_main_green()
            
    def _transition_to_main_green(self) -> None:
        """Transition to MAIN_GREEN after ALL_RED clearance."""
        self._main.signal = SignalState.GREEN
        self._side.signal = SignalState.RED
        self._phase = ControllerPhase.MAIN_GREEN
        self._phase_start_time = time.time()
        
    def _handle_emergency_transition_yellow(self, elapsed: float) -> None:
        """Handle yellow phase during emergency transition."""
        if elapsed >= self.timing.yellow_time:
            # Transition to All-Red before activating emergency
            self._main.signal = SignalState.ALL_RED
            self._side.signal = SignalState.ALL_RED
            self._phase = ControllerPhase.EMERGENCY_TRANSITION_ALL_RED
            self._phase_start_time = time.time()
            
    def _handle_emergency_transition_all_red(self, elapsed: float) -> None:
        """Handle All-Red phase during emergency transition."""
        if elapsed >= self.timing.all_red_time:
            # Activate emergency green for the designated road
            self._activate_emergency_green()
            
    def _activate_emergency_green(self) -> None:
        """Activate emergency green for the designated road."""
        if self._emergency_road == 'main':
            self._main.signal = SignalState.GREEN
            self._side.signal = SignalState.RED
        else:
            self._main.signal = SignalState.RED
            self._side.signal = SignalState.GREEN
            
        self._phase = ControllerPhase.EMERGENCY_ACTIVE
        self._phase_start_time = time.time()
        
    def _handle_emergency_active(self) -> None:
        """Handle active emergency phase - wait for clear signal."""
        # Emergency stays active until clear_emergency() is called
        # The clear_emergency method will transition us to EXIT_YELLOW
        pass
        
    def _handle_emergency_exit_yellow(self, elapsed: float) -> None:
        """Handle yellow phase when exiting emergency mode."""
        if elapsed >= self.timing.yellow_time:
            # Transition to All-Red before resuming normal operation
            self._main.signal = SignalState.ALL_RED
            self._side.signal = SignalState.ALL_RED
            self._phase = ControllerPhase.EMERGENCY_EXIT_ALL_RED
            self._phase_start_time = time.time()
            
    def _handle_emergency_exit_all_red(self, elapsed: float) -> None:
        """Handle All-Red phase when exiting emergency mode."""
        if elapsed >= self.timing.all_red_time:
            # Resume normal operation based on pending road or density
            self._resume_normal_operation()
            
    def _resume_normal_operation(self) -> None:
        """Resume normal operation after emergency clears."""
        # Determine which road should get green based on pending or density
        if self._pending_road_after_emergency == 'main' or self._main.density >= self._side.density:
            self._main.signal = SignalState.GREEN
            self._side.signal = SignalState.RED
            self._phase = ControllerPhase.MAIN_GREEN
        else:
            self._main.signal = SignalState.RED
            self._side.signal = SignalState.GREEN
            self._phase = ControllerPhase.SIDE_GREEN
            
        self._phase_start_time = time.time()
        self._emergency_road = None
        self._pre_emergency_phase = None
        self._pending_road_after_emergency = None


# Convenience function to create controller with default settings
def create_controller(
    min_green: float = 5.0,
    max_green: float = 30.0,
    yellow: float = 3.0,
    all_red: float = 2.0
) -> AdaptiveSignalController:
    """Create a controller with specified timing parameters."""
    timing = SignalTiming(
        min_green_time=min_green,
        max_green_time=max_green,
        yellow_time=yellow,
        all_red_time=all_red,
    )
    return AdaptiveSignalController(timing)
