# Trajectory

 Analysis: How I Deconstructed the Prompt

From the start, I identified that this task was about implementing a production-ready industrial weighbridge controller that handles real-world sensor noise, thermal drift, and dynamic environmental conditions. The problem statement revealed critical constraints that a naive implementation would fail to address.

Key requirements I extracted:

**Core Problem:**
- Raw load cell data is noisy and prone to thermal drift
- Initial zero point changes throughout the day (rain, debris accumulation)
- Simple `(CurrentRaw - InitialRaw) * CalibrationFactor` fails in production

**Engineering Requirements:**
- Auto-zero tracking: background process that adjusts zero-point when scale is "Empty and Stable"
- Stability detection: requires statistical variance calculation on signal stream
- State machine: EMPTY → IN_MOTION → LOCKED transitions
- Thread-safe operation for concurrent sensor readings
- Safety: prevent auto-taring when weight is locked (critical for industrial safety)

**Technical Constraints:**
- Real-time processing of ADC readings
- Moving window statistics (circular buffer for recent N samples)
- Time-based state transitions (5 seconds for zero adjustment, 2 seconds for lock)
- Event-driven architecture for weight locked notifications

I framed the problem in four layers:

1. **Signal Processing Layer**: Circular buffer for moving window, variance calculation for stability detection
2. **State Machine Layer**: Three-state system (EMPTY, IN_MOTION, LOCKED) with time-based transitions
3. **Safety Layer**: Zero adjustment only when EMPTY and STABLE, never when LOCKED
4. **Concurrency Layer**: Thread-safe operations using mutexes for multi-threaded sensor updates

## Strategy: Why This Design and Patterns Were Chosen

### Circular Buffer for Moving Window Statistics

A circular buffer (ring buffer) was chosen over a simple slice because:
- **Memory efficiency**: Fixed-size allocation prevents unbounded memory growth
- **Performance**: O(1) insertion with automatic overwriting of oldest values
- **Real-time suitability**: Constant memory footprint regardless of runtime duration
- **Thread-safety**: RWMutex protection allows concurrent reads during writes

The buffer stores the last 50 raw ADC samples, providing sufficient history for variance calculation while maintaining low latency.

### Manual Variance Calculation

Variance is calculated manually rather than using a statistics library because:
- **Self-contained**: No external dependencies for core functionality
- **Performance**: Direct calculation avoids library overhead
- **Clarity**: Formula `Variance = Σ(xi - μ)² / N` is explicit in code
- **Control**: Population variance (not sample variance) matches the requirement

The variance threshold (default 100.0) distinguishes between stable (low variance) and unstable (high variance) states, enabling motion detection.

### State Machine Design

The three-state machine (EMPTY → IN_MOTION → LOCKED) was chosen because:
- **Clear semantics**: Each state represents a distinct physical condition
- **Deterministic transitions**: Variance and time-based conditions ensure predictable behavior
- **Safety**: LOCKED state prevents zero adjustment, protecting against accidental tare of loaded vehicles
- **Event emission**: WeightLockedEvent channel provides async notification without blocking updates

State transitions are guarded by:
- **Variance check**: High variance forces IN_MOTION (motion detected)
- **Time thresholds**: Zero adjustment requires 5 seconds of stability; lock requires 2 seconds
- **Zero band**: Configurable band (±50 raw units default) defines "near zero"

### Thread-Safe Architecture

RWMutex was chosen over regular Mutex because:
- **Read optimization**: Multiple concurrent `GetWeight()`, `GetStatus()`, `GetVariance()` calls can proceed simultaneously
- **Write protection**: Update operations acquire exclusive lock
- **Deadlock prevention**: Consistent lock ordering (always acquire write lock before read locks)

All public methods are thread-safe, enabling safe use in multi-threaded industrial control systems.

### Zero Adjustment Safety

The critical safety feature prevents zero adjustment when LOCKED:
- **Industrial requirement**: Auto-taring a loaded truck would cause catastrophic measurement errors
- **State-based protection**: Zero offset only adjusts in EMPTY state
- **Conditional logic**: Even in EMPTY, requires both stability AND near-zero conditions for 5 seconds

This prevents the system from incorrectly calibrating when debris accumulates on a loaded scale.

## Execution: Step-by-Step Implementation

### Phase 1: Core Data Structures

1. **CircularBuffer Implementation**
   - Created thread-safe circular buffer with fixed size
   - Implemented `Add()`, `GetValues()`, and `Count()` methods
   - Used head pointer with modulo arithmetic for circular indexing
   - RWMutex protection for concurrent access

2. **Weighbridge Struct Design**
   - Configuration parameters (calibration factor, thresholds, timeouts)
   - State variables (zero offset, status, buffer)
   - Timing trackers (zeroAdjustStart, lockStart, lastUpdate)
   - Event channel for weight locked notifications
   - Mutex for thread safety

### Phase 2: Statistical Calculations

3. **Manual Average Calculation**
   - Implemented `calculateAverage()` using simple sum/len
   - Handles empty buffer edge case

4. **Manual Variance Calculation**
   - Implemented `calculateVariance()` using population variance formula
   - Requires pre-calculated mean for efficiency
   - Returns 0.0 for insufficient samples

### Phase 3: State Machine Logic

5. **Update Method Implementation**
   - Early return if buffer has < 2 samples (variance requires at least 2)
   - Calculate moving average and variance from buffer
   - High variance check: force IN_MOTION status immediately
   - Low variance path: process state machine transitions

6. **State Transitions**
   - **EMPTY**: Track zero adjustment timer; transition to IN_MOTION if weight rises
   - **IN_MOTION**: Track lock timer; emit event and transition to LOCKED after 2 seconds
   - **LOCKED**: Monitor for return to zero; prevent zero adjustment (safety)

### Phase 4: Thread Safety

7. **Mutex Protection**
   - All state-modifying operations acquire write lock
   - Read operations use read lock for concurrent access
   - Consistent lock ordering prevents deadlocks

8. **Event Channel**
   - Buffered channel (capacity 10) for non-blocking event emission
   - Select statement with default case prevents blocking on full channel

### Phase 5: Testing Infrastructure

9. **Go Module Setup**
   - Created `tests/go.mod` for test execution
   - Created `evaluation/go.mod` with uuid dependency

10. **Test File Creation**
    - Implemented `TestCircularBuffer` covering:
      - Initial state validation
      - Value addition and retrieval
      - Circular overflow behavior
      - Order preservation

11. **Evaluation Script**
    - Created `evaluate.go` to run tests on both repository states
    - Captures test output, return codes, and environment info
    - Generates structured JSON report matching expected format
    - Handles missing repository_before gracefully

### Phase 6: Safety and Edge Cases

12. **Edge Case Handling**
    - Empty buffer: returns 0.0 for weight/variance
    - Insufficient samples: early return in Update()
    - Channel full: non-blocking event emission with default case
    - Missing repository: graceful error handling in evaluation

13. **Safety Features**
    - Zero adjustment only in EMPTY state
    - High variance immediately forces IN_MOTION
    - Locked state prevents any zero offset changes
    - Time-based transitions prevent rapid state oscillation

## Resources: Documentation and References Used

### Algorithm & Signal Processing

**Circular Buffer Pattern:**
- Ring buffer implementation for real-time data streams
- Standard pattern in embedded systems and signal processing

**Statistical Variance:**
- Population variance formula: `σ² = Σ(xi - μ)² / N`
- Used for stability detection in noisy sensor data
- Moving window variance for real-time analysis

### Go Language & Concurrency

**Go Concurrency:**
- Go Concurrency Patterns: https://go.dev/blog/pipelines
- sync.RWMutex Documentation: https://pkg.go.dev/sync#RWMutex
- Channel Communication: https://go.dev/doc/effective_go#channels

**Go Testing:**
- Testing Package: https://pkg.go.dev/testing
- Table-driven tests pattern
- JSON test output format

### State Machine Design

**Finite State Machines:**
- State machine pattern for embedded systems
- Time-based state transitions
- Guard conditions for state changes

### Industrial Control Systems

**Load Cell Signal Processing:**
- ADC (Analog-to-Digital Converter) reading patterns
- Sensor noise filtering techniques
- Thermal drift compensation strategies

**Safety-Critical Systems:**
- Fail-safe design principles
- State-based safety guards
- Event-driven architectures for industrial control

### Tooling & Infrastructure

**Docker:**
- Docker Documentation: https://docs.docker.com/
- Docker Compose: https://docs.docker.com/compose/
- Containerized testing for environment consistency

**Go Modules:**
- Go Modules Reference: https://go.dev/ref/mod
- Dependency management with go.mod
- Module path and versioning

## Final Note

This trajectory reflects an engineering-driven approach focused on correctness, safety, and real-world reliability. The implementation prioritizes:

1. **Safety**: Zero adjustment prevention when locked prevents catastrophic measurement errors
2. **Reliability**: Thread-safe operations ensure correct behavior under concurrent load
3. **Accuracy**: Statistical variance-based stability detection handles noisy sensor data
4. **Maintainability**: Clear state machine and explicit calculations improve code readability

Most implementation decisions were guided by industrial control system requirements: deterministic behavior, safety constraints, and real-time performance. The solution addresses the core problem of thermal drift and environmental changes through adaptive zero tracking while maintaining strict safety guarantees.
