# Trajectory: Event-Driven Traffic FSM with Preemption & Safety Interlocks

## 1. Audit and Requirements Analysis

Analyzed the requirements for an adaptive traffic signal controller:
- Thread-safe Python class `AdaptiveSignalController`
- Event-driven FSM with dynamic green phase duration
- Fixed Yellow and All-Red safety intervals
- Dilemma Zone protection (minimum green time)
- Conflicting Phase Guard (no simultaneous Green/Yellow)
- Emergency Preemption with safe transitions
- 9 specific requirements to implement and test

## 2. Design Contract Definition

Defined the safety-critical constraints:
- **Phase Sequence**: Green → Yellow → All-Red → Red (no skipping)
- **Conflicting Phase Guard**: Never Green/Yellow on both roads simultaneously
- **Dilemma Zone**: Minimum green time even with zero traffic
- **Emergency Safety**: Yellow → All-Red before emergency Green activation
- **Deadlock Prevention**: Resume normal operation after emergency clears
- **Starvation Prevention**: Max green time enforces switch

## 3. Data Model Design

Created state enums and dataclasses:
- `SignalState`: RED, GREEN, YELLOW, ALL_RED
- `ControllerPhase`: All FSM phases including emergency transitions
- `SignalTiming`: Configurable timing parameters
- `RoadState`: Signal state and density per road
- `ControllerState`: Complete snapshot for hardware polling

## 4. Implementation

Built the `AdaptiveSignalController` class with:
- Thread-safe operations using `threading.RLock`
- Event-driven loop with `threading.Event`
- Proper phase transition handlers
- Emergency preemption with safe Yellow → All-Red → Green sequence
- Recovery to normal operation after emergency clears
- `get_current_state()` method for hardware driver polling

## 5. Test Suite Development

Created comprehensive tests covering all 9 requirements:
1. `TestPhaseSequence` - Strict phase sequence validation
2. `TestConflictingPhaseGuard` - No simultaneous active signals
3. `TestDilemmaZoneProtection` - Minimum green time enforcement
4. `TestEmergencyTransitionSafety` - Safe emergency transitions
5. `TestEmergencyExitDeadlockPrevention` - Resume after emergency
6. `TestStarvationPrevention` - Max green time enforcement
7. `TestThreadSafeDensityUpdates` - Concurrent update safety
8. `TestAllRedClearanceInterval` - All-Red phase validation
9. `TestStatePatternUsage` - Proper Enum usage

## 6. Evaluation System

Implemented evaluation runner that:
- Runs pytest with verbose output
- Parses test results (nodeid and status)
- Generates structured JSON report
- Saves to timestamped directory
- Produces required terminal output format

## 7. Verification

- All tests pass
- Docker commands work correctly
- Report generation verified
- Safety constraints validated through polling tests

## Core Principle Applied

Audit → Contract → Design → Execute → Verify
