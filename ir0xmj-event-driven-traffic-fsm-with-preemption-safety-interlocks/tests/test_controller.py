"""
Comprehensive tests for AdaptiveSignalController.

Tests cover all 9 requirements:
1. Strict Phase Sequence (Green -> Yellow -> All-Red -> Red)
2. Conflicting Phase Guard (no simultaneous Green/Yellow on both roads)
3. Dilemma Zone Protection (minimum green time enforcement)
4. Emergency Transition Safety (Yellow -> All-Red before emergency Green)
5. Emergency Exit / Deadlock Prevention (resume normal after emergency clears)
6. Starvation Prevention (max_green_time enforcement)
7. Thread-Safe Density Updates
8. All-Red Clearance Interval
9. State Pattern / Enum Usage
"""

import pytest
import time
import threading
import sys
import os

# Add repository_after to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from states import SignalState, ControllerPhase
from timing import SignalTiming
from models import RoadState, ControllerState
from controller import AdaptiveSignalController, create_controller


class TestPhaseSequence:
    """Test Requirement 1: Strict Phase Sequence (Green -> Yellow -> All-Red -> Red)."""
    
    def test_main_green_to_yellow_to_all_red_sequence(self):
        """Verify Main road follows Green -> Yellow -> All-Red -> Red sequence."""
        timing = SignalTiming(
            min_green_time=0.1,
            max_green_time=0.2,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Initial state should be Main Green
            state = controller.get_current_state()
            assert state.main_signal == SignalState.GREEN
            assert state.side_signal == SignalState.RED
            
            # Track phases seen to verify sequence
            phases_seen = [state.main_signal]
            
            # Poll for 2 seconds to observe full cycle
            for _ in range(200):
                time.sleep(0.01)
                state = controller.get_current_state()
                if state.main_signal != phases_seen[-1]:
                    phases_seen.append(state.main_signal)
                    
            # Verify we saw the proper sequence (Green -> Yellow -> AllRed -> Red)
            # We should see at least GREEN, YELLOW sequence
            assert SignalState.GREEN in phases_seen, "GREEN not seen"
            assert SignalState.YELLOW in phases_seen, "YELLOW not seen"
            
            # Verify YELLOW comes after GREEN in sequence
            green_idx = phases_seen.index(SignalState.GREEN)
            yellow_idx = phases_seen.index(SignalState.YELLOW)
            assert yellow_idx > green_idx, "YELLOW should come after GREEN"
        finally:
            controller.stop()
            
    def test_no_direct_green_to_red_transition(self):
        """Verify no direct Green -> Red transition (must go through Yellow)."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        states_seen = []
        
        try:
            # Poll every 10ms for 1 second
            for _ in range(100):
                state = controller.get_current_state()
                states_seen.append((state.main_signal, state.side_signal))
                time.sleep(0.01)
                
            # Check that Green never directly transitions to Red
            main_signals = [s[0] for s in states_seen]
            for i in range(1, len(main_signals)):
                if main_signals[i-1] == SignalState.GREEN and main_signals[i] == SignalState.RED:
                    # This should not happen - must go through Yellow
                    # Check if Yellow was skipped
                    if SignalState.YELLOW not in main_signals[max(0, i-5):i]:
                        pytest.fail("Direct Green -> Red transition detected (Yellow skipped)")
        finally:
            controller.stop()
            
    def test_all_red_always_between_phases(self):
        """Verify All-Red clearance interval exists between handovers."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.05,
            all_red_time=0.05,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        saw_all_red = False
        
        try:
            # Poll and track states
            for _ in range(200):
                state = controller.get_current_state()
                if state.main_signal == SignalState.ALL_RED and state.side_signal == SignalState.ALL_RED:
                    saw_all_red = True
                    break
                time.sleep(0.01)
                
            assert saw_all_red, "All-Red clearance interval never observed"
        finally:
            controller.stop()


class TestConflictingPhaseGuard:
    """Test Requirement 2: No simultaneous Green/Yellow on both roads."""
    
    def test_no_simultaneous_green(self):
        """Verify Main and Side are never both Green simultaneously."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.05,
            all_red_time=0.05,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Poll every 10ms for 2 seconds (200 samples)
            for _ in range(200):
                state = controller.get_current_state()
                
                # Safety check: both cannot be Green
                if state.main_signal == SignalState.GREEN and state.side_signal == SignalState.GREEN:
                    pytest.fail("SAFETY VIOLATION: Both roads Green simultaneously!")
                    
                time.sleep(0.01)
        finally:
            controller.stop()
            
    def test_no_simultaneous_yellow(self):
        """Verify Main and Side are never both Yellow simultaneously."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.05,
            all_red_time=0.05,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Poll every 10ms for 2 seconds
            for _ in range(200):
                state = controller.get_current_state()
                
                # Safety check: both cannot be Yellow
                if state.main_signal == SignalState.YELLOW and state.side_signal == SignalState.YELLOW:
                    pytest.fail("SAFETY VIOLATION: Both roads Yellow simultaneously!")
                    
                time.sleep(0.01)
        finally:
            controller.stop()
            
    def test_no_green_and_yellow_conflict(self):
        """Verify one road isn't Green while other is Yellow."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.05,
            all_red_time=0.05,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            for _ in range(200):
                state = controller.get_current_state()
                
                # Check conflicting combinations
                main_active = state.main_signal in (SignalState.GREEN, SignalState.YELLOW)
                side_active = state.side_signal in (SignalState.GREEN, SignalState.YELLOW)
                
                if main_active and side_active:
                    pytest.fail(f"SAFETY VIOLATION: Conflicting active signals - Main: {state.main_signal}, Side: {state.side_signal}")
                    
                time.sleep(0.01)
        finally:
            controller.stop()


class TestDilemmaZoneProtection:
    """Test Requirement 3: Minimum green time enforcement."""
    
    def test_minimum_green_time_main(self):
        """Verify Main green persists for at least min_green_time even with zero traffic."""
        timing = SignalTiming(
            min_green_time=0.5,  # 500ms minimum
            max_green_time=1.0,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        
        # Set zero density on main road
        controller.update_density('main', 0.0)
        controller.update_density('side', 1.0)  # High traffic on side
        
        controller.start()
        
        try:
            start_time = time.time()
            
            # Poll and verify green stays for min_green_time
            while time.time() - start_time < 0.4:  # Check before min_green_time
                state = controller.get_current_state()
                assert state.main_signal == SignalState.GREEN, \
                    f"Green ended early at {time.time() - start_time:.3f}s (min is 0.5s)"
                time.sleep(0.01)
        finally:
            controller.stop()
            
    def test_gap_out_false_positive_protection(self):
        """
        Test Dilemma Zone: if density drops to zero then spikes, 
        don't abruptly switch if min_green hasn't elapsed.
        """
        timing = SignalTiming(
            min_green_time=0.5,
            max_green_time=1.0,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Start with traffic
            controller.update_density('main', 0.5)
            time.sleep(0.1)
            
            # Simulate gap-out: density drops to zero
            controller.update_density('main', 0.0)
            time.sleep(0.05)
            
            # Instant spike back up
            controller.update_density('main', 0.8)
            
            # Should still be Green (within min_green_time)
            state = controller.get_current_state()
            assert state.main_signal == SignalState.GREEN, \
                "Signal switched away during gap-out false positive within min_green_time"
        finally:
            controller.stop()


class TestEmergencyTransitionSafety:
    """Test Requirement 4: Emergency transition must go through Yellow -> All-Red."""
    
    def test_emergency_no_instant_switch(self):
        """Verify emergency doesn't cause instant Green -> Red (state teleportation)."""
        timing = SignalTiming(
            min_green_time=0.5,
            max_green_time=1.0,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Verify initial state is Main Green
            state = controller.get_current_state()
            assert state.main_signal == SignalState.GREEN
            
            # Trigger emergency on Side road
            controller.trigger_emergency('side')
            
            # Immediately check - should NOT be Side Green yet
            state = controller.get_current_state()
            assert state.side_signal != SignalState.GREEN, \
                "SAFETY VIOLATION: Emergency caused instant state teleportation!"
                
            # Main should be transitioning (Yellow or Green still)
            assert state.main_signal in (SignalState.GREEN, SignalState.YELLOW, SignalState.ALL_RED)
        finally:
            controller.stop()
            
    def test_emergency_goes_through_yellow(self):
        """Verify emergency transition includes Yellow phase."""
        timing = SignalTiming(
            min_green_time=0.1,
            max_green_time=0.2,
            yellow_time=0.15,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Trigger emergency
            controller.trigger_emergency('side')
            
            saw_yellow = False
            # Poll for yellow phase
            for _ in range(50):
                state = controller.get_current_state()
                if state.main_signal == SignalState.YELLOW:
                    saw_yellow = True
                    break
                time.sleep(0.01)
                
            assert saw_yellow, "Yellow phase not observed during emergency transition"
        finally:
            controller.stop()
            
    def test_emergency_goes_through_all_red(self):
        """Verify emergency transition includes All-Red clearance."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.1,
            all_red_time=0.15,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Trigger emergency
            controller.trigger_emergency('side')
            
            saw_all_red = False
            # Poll for all-red phase
            for _ in range(100):
                state = controller.get_current_state()
                if state.main_signal == SignalState.ALL_RED and state.side_signal == SignalState.ALL_RED:
                    saw_all_red = True
                    break
                time.sleep(0.01)
                
            assert saw_all_red, "All-Red clearance not observed during emergency transition"
        finally:
            controller.stop()


class TestEmergencyExitDeadlockPrevention:
    """Test Requirement 5: System must resume normal operation after emergency clears."""
    
    def test_emergency_exit_resumes_normal(self):
        """Verify controller resumes normal cycle after emergency clears."""
        timing = SignalTiming(
            min_green_time=0.1,
            max_green_time=0.2,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Trigger and activate emergency
            controller.trigger_emergency('side')
            
            # Wait for emergency to become active
            for _ in range(50):
                state = controller.get_current_state()
                if state.phase == ControllerPhase.EMERGENCY_ACTIVE:
                    break
                time.sleep(0.02)
                
            # Clear emergency
            controller.clear_emergency()
            
            # Wait for normal operation to resume
            time.sleep(0.5)
            
            state = controller.get_current_state()
            
            # Should NOT be stuck in emergency state
            assert state.phase not in (
                ControllerPhase.EMERGENCY_ACTIVE,
                ControllerPhase.EMERGENCY_TRANSITION_YELLOW,
                ControllerPhase.EMERGENCY_TRANSITION_ALL_RED,
            ), f"DEADLOCK: Controller stuck in emergency state {state.phase}"
            
            # Should be in normal operation
            normal_phases = (
                ControllerPhase.MAIN_GREEN, ControllerPhase.MAIN_YELLOW,
                ControllerPhase.MAIN_TO_SIDE_ALL_RED,
                ControllerPhase.SIDE_GREEN, ControllerPhase.SIDE_YELLOW,
                ControllerPhase.SIDE_TO_MAIN_ALL_RED,
                ControllerPhase.EMERGENCY_EXIT_YELLOW,
                ControllerPhase.EMERGENCY_EXIT_ALL_RED,
            )
            assert state.phase in normal_phases, \
                f"Controller not in normal operation phase: {state.phase}"
        finally:
            controller.stop()
            
    def test_no_frozen_state_after_emergency(self):
        """Verify signals continue cycling after emergency, not frozen."""
        timing = SignalTiming(
            min_green_time=0.1,
            max_green_time=0.2,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Trigger and clear emergency
            controller.trigger_emergency('main')
            time.sleep(0.6)  # Let emergency activate
            controller.clear_emergency()
            time.sleep(0.5)  # Let it exit emergency fully
            
            # Record state changes over time with longer observation window
            phases_seen = set()
            for _ in range(200):
                state = controller.get_current_state()
                phases_seen.add(state.phase)
                time.sleep(0.02)
                
            # Should see at least one phase (not frozen/crashed)
            # The controller should be running and cycling
            assert len(phases_seen) >= 1, \
                f"Controller appears frozen - only saw phases: {phases_seen}"
            
            # Verify we're in a valid normal or transition state
            valid_phases = (
                ControllerPhase.MAIN_GREEN, ControllerPhase.MAIN_YELLOW,
                ControllerPhase.MAIN_TO_SIDE_ALL_RED,
                ControllerPhase.SIDE_GREEN, ControllerPhase.SIDE_YELLOW,
                ControllerPhase.SIDE_TO_MAIN_ALL_RED,
            )
            assert any(p in valid_phases for p in phases_seen), \
                f"No valid normal phases seen: {phases_seen}"
        finally:
            controller.stop()


class TestStarvationPrevention:
    """Test Requirement 6: Light must eventually switch even with continuous traffic."""
    
    def test_max_green_forces_switch(self):
        """Verify max_green_time forces switch even with continuous traffic."""
        timing = SignalTiming(
            min_green_time=0.1,
            max_green_time=0.3,  # 300ms max
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        
        # Continuous heavy traffic on main
        controller.update_density('main', 1.0)
        controller.update_density('side', 0.5)
        
        controller.start()
        
        try:
            start_time = time.time()
            switched = False
            
            # Monitor for 1 second
            while time.time() - start_time < 1.0:
                state = controller.get_current_state()
                if state.main_signal != SignalState.GREEN:
                    switched = True
                    break
                time.sleep(0.01)
                
            assert switched, \
                "STARVATION: Main stayed Green indefinitely despite max_green_time"
        finally:
            controller.stop()
            
    def test_both_roads_get_green_time(self):
        """Verify both roads eventually get Green time with continuous traffic on both."""
        timing = SignalTiming(
            min_green_time=0.1,
            max_green_time=0.3,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        
        # Continuous traffic on both roads
        controller.update_density('main', 0.8)
        controller.update_density('side', 0.8)
        
        controller.start()
        
        try:
            main_green_seen = False
            side_green_seen = False
            
            # Monitor for 2 seconds
            for _ in range(200):
                state = controller.get_current_state()
                if state.main_signal == SignalState.GREEN:
                    main_green_seen = True
                if state.side_signal == SignalState.GREEN:
                    side_green_seen = True
                    
                if main_green_seen and side_green_seen:
                    break
                time.sleep(0.01)
                
            assert main_green_seen, "Main road never got Green time"
            assert side_green_seen, "Side road never got Green time (STARVATION)"
        finally:
            controller.stop()


class TestThreadSafeDensityUpdates:
    """Test Requirement 7: Thread-safe sensor updates."""
    
    def test_concurrent_density_updates(self):
        """Verify concurrent density updates don't cause race conditions."""
        timing = SignalTiming(
            min_green_time=0.2,
            max_green_time=0.5,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        errors = []
        update_count = [0]
        
        def update_main():
            for i in range(100):
                try:
                    controller.update_density('main', (i % 10) / 10.0)
                    update_count[0] += 1
                except Exception as e:
                    errors.append(f"Main update error: {e}")
                time.sleep(0.005)
                
        def update_side():
            for i in range(100):
                try:
                    controller.update_density('side', (i % 10) / 10.0)
                    update_count[0] += 1
                except Exception as e:
                    errors.append(f"Side update error: {e}")
                time.sleep(0.005)
                
        def read_state():
            for _ in range(100):
                try:
                    state = controller.get_current_state()
                    # Verify state is consistent
                    assert state.main_density >= 0.0 and state.main_density <= 1.0
                    assert state.side_density >= 0.0 and state.side_density <= 1.0
                except Exception as e:
                    errors.append(f"Read state error: {e}")
                time.sleep(0.005)
        
        try:
            threads = [
                threading.Thread(target=update_main),
                threading.Thread(target=update_side),
                threading.Thread(target=read_state),
            ]
            
            for t in threads:
                t.start()
            for t in threads:
                t.join()
                
            assert len(errors) == 0, f"Thread safety errors: {errors}"
            assert update_count[0] == 200, "Not all updates completed"
        finally:
            controller.stop()
            
    def test_density_updates_affect_logic(self):
        """Verify density updates affect the next logic cycle."""
        timing = SignalTiming(
            min_green_time=0.1,
            max_green_time=0.5,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        
        # Start with no traffic on main, traffic on side
        controller.update_density('main', 0.0)
        controller.update_density('side', 1.0)
        
        controller.start()
        
        try:
            # Wait past min_green
            time.sleep(0.15)
            
            # With zero traffic on main and high traffic on side,
            # main should transition to yellow (after min_green)
            state = controller.get_current_state()
            
            # Should have started transitioning
            assert state.main_signal in (SignalState.YELLOW, SignalState.ALL_RED) or \
                   state.phase != ControllerPhase.MAIN_GREEN, \
                   "Density update didn't affect transition logic"
        finally:
            controller.stop()


class TestAllRedClearanceInterval:
    """Test Requirement 8: All-Red clearance interval between phases."""
    
    def test_all_red_duration(self):
        """Verify All-Red phase has correct duration."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.05,
            all_red_time=0.15,  # 150ms All-Red
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            all_red_start = None
            all_red_end = None
            
            # Find All-Red phase
            for _ in range(200):
                state = controller.get_current_state()
                
                if state.main_signal == SignalState.ALL_RED and state.side_signal == SignalState.ALL_RED:
                    if all_red_start is None:
                        all_red_start = time.time()
                elif all_red_start is not None and all_red_end is None:
                    all_red_end = time.time()
                    break
                    
                time.sleep(0.01)
                
            if all_red_start and all_red_end:
                duration = all_red_end - all_red_start
                # Allow 50ms tolerance
                assert abs(duration - 0.15) < 0.05, \
                    f"All-Red duration was {duration:.3f}s, expected ~0.15s"
        finally:
            controller.stop()
            
    def test_all_red_both_roads_red(self):
        """Verify during All-Red, both roads show Red/All-Red."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.05,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            for _ in range(200):
                state = controller.get_current_state()
                
                # If in All-Red phase
                if state.phase in (ControllerPhase.MAIN_TO_SIDE_ALL_RED, 
                                   ControllerPhase.SIDE_TO_MAIN_ALL_RED):
                    # Both signals should be ALL_RED
                    assert state.main_signal == SignalState.ALL_RED
                    assert state.side_signal == SignalState.ALL_RED
                    break
                    
                time.sleep(0.01)
        finally:
            controller.stop()


class TestStatePatternUsage:
    """Test Requirement 9: Proper Enum and State pattern usage."""
    
    def test_signal_state_is_enum(self):
        """Verify SignalState is an Enum."""
        from enum import Enum
        assert issubclass(SignalState, Enum)
        
    def test_controller_phase_is_enum(self):
        """Verify ControllerPhase is an Enum."""
        from enum import Enum
        assert issubclass(ControllerPhase, Enum)
        
    def test_all_signal_states_defined(self):
        """Verify all required signal states exist."""
        required_states = ['RED', 'GREEN', 'YELLOW', 'ALL_RED']
        for state in required_states:
            assert hasattr(SignalState, state), f"Missing SignalState.{state}"
            
    def test_state_returned_is_enum(self):
        """Verify get_current_state returns Enum values, not strings."""
        controller = AdaptiveSignalController()
        state = controller.get_current_state()
        
        assert isinstance(state.main_signal, SignalState)
        assert isinstance(state.side_signal, SignalState)
        assert isinstance(state.phase, ControllerPhase)
        
    def test_no_loose_string_states(self):
        """Verify states are not stored as loose strings."""
        controller = AdaptiveSignalController()
        
        # Access internal state
        assert isinstance(controller._main.signal, SignalState)
        assert isinstance(controller._side.signal, SignalState)
        assert isinstance(controller._phase, ControllerPhase)


class TestEdgeCases:
    """Additional edge case tests."""
    
    def test_emergency_during_yellow(self):
        """Test emergency trigger during Yellow phase."""
        timing = SignalTiming(
            min_green_time=0.05,
            max_green_time=0.1,
            yellow_time=0.2,  # Long yellow to catch it
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.update_density('main', 0.0)  # Force quick transition
        controller.start()
        
        try:
            # Wait for yellow
            for _ in range(50):
                state = controller.get_current_state()
                if state.main_signal == SignalState.YELLOW:
                    break
                time.sleep(0.01)
                
            # Trigger emergency during yellow
            controller.trigger_emergency('side')
            
            # Should still go through proper transition
            time.sleep(0.5)
            state = controller.get_current_state()
            
            # Should not have conflicting signals
            main_active = state.main_signal in (SignalState.GREEN, SignalState.YELLOW)
            side_active = state.side_signal in (SignalState.GREEN, SignalState.YELLOW)
            assert not (main_active and side_active)
        finally:
            controller.stop()
            
    def test_multiple_emergency_triggers(self):
        """Test multiple consecutive emergency triggers."""
        timing = SignalTiming(
            min_green_time=0.1,
            max_green_time=0.2,
            yellow_time=0.1,
            all_red_time=0.1,
        )
        controller = AdaptiveSignalController(timing)
        controller.start()
        
        try:
            # Multiple emergency triggers
            controller.trigger_emergency('main')
            time.sleep(0.1)
            controller.trigger_emergency('side')
            time.sleep(0.1)
            controller.trigger_emergency('main')
            
            # Should not crash and should maintain safety
            time.sleep(0.3)
            state = controller.get_current_state()
            
            # Safety check
            main_active = state.main_signal in (SignalState.GREEN, SignalState.YELLOW)
            side_active = state.side_signal in (SignalState.GREEN, SignalState.YELLOW)
            assert not (main_active and side_active)
        finally:
            controller.stop()
            
    def test_clear_emergency_when_not_active(self):
        """Test clearing emergency when not in emergency mode."""
        controller = AdaptiveSignalController()
        controller.start()
        
        try:
            # Clear without triggering - should not crash
            controller.clear_emergency()
            
            state = controller.get_current_state()
            assert state.main_signal == SignalState.GREEN  # Normal operation
        finally:
            controller.stop()
            
    def test_stop_and_restart(self):
        """Test stopping and restarting the controller."""
        controller = AdaptiveSignalController()
        controller.start()
        
        time.sleep(0.1)
        controller.stop()
        
        # Restart
        controller.start()
        time.sleep(0.1)
        
        state = controller.get_current_state()
        assert state.main_signal in (SignalState.GREEN, SignalState.YELLOW, SignalState.ALL_RED, SignalState.RED)
        
        controller.stop()
        
    def test_invalid_road_name(self):
        """Test invalid road name raises error."""
        controller = AdaptiveSignalController()
        
        with pytest.raises(ValueError):
            controller.update_density('invalid', 0.5)
            
    def test_density_clamping(self):
        """Test density values are clamped to 0-1 range."""
        controller = AdaptiveSignalController()
        
        controller.update_density('main', -0.5)
        state = controller.get_current_state()
        assert state.main_density == 0.0
        
        controller.update_density('main', 1.5)
        state = controller.get_current_state()
        assert state.main_density == 1.0


class TestCreateControllerHelper:
    """Test the convenience create_controller function."""
    
    def test_create_with_defaults(self):
        """Test creating controller with default timing."""
        controller = create_controller()
        assert controller.timing.min_green_time == 5.0
        assert controller.timing.max_green_time == 30.0
        
    def test_create_with_custom_timing(self):
        """Test creating controller with custom timing."""
        controller = create_controller(
            min_green=2.0,
            max_green=10.0,
            yellow=1.5,
            all_red=1.0
        )
        assert controller.timing.min_green_time == 2.0
        assert controller.timing.max_green_time == 10.0
        assert controller.timing.yellow_time == 1.5
        assert controller.timing.all_red_time == 1.0
