# Trajectory

Analysis: How I Deconstructed the Prompt

The prompt presented a classic signal processing challenge in an IoT logistics context. The core problem was filtering noisy RFID data to extract meaningful movement events while avoiding false positives from signal reflections (multipath) and transient reads.

Key Requirements Extracted:

1. **No Data Science Libraries Constraint**: Strictly forbidden from using pandas, numpy, or scipy. This forced me to implement signal smoothing algorithms using only Python standard library collections.

2. **Cross-Read Suppression**: The critical engineering challenge - tags are often read by both antennas simultaneously due to signal reflection, but with varying signal strengths. The system must determine the "true zone" based on RSSI dominance.

3. **Temporal Filtering Requirements**:
   - Sliding window weighted average for RSSI smoothing
   - Debouncing: Filter out ghost reads (< 200ms duration)
   - Stale tag purging: Remove inactive tags after 3 seconds

4. **State Machine Logic**:
   - Hysteresis loop to prevent rapid state flickering
   - Directionality detection: INBOUND (Door → Interior) vs OUTBOUND (Interior → Door)
   - Minimum RSSI delta threshold (> 5dBm) for zone determination

5. **Robustness Requirements**:
   - Handle out-of-order timestamps gracefully
   - Maintain session/buffer per tag_id
   - Emit movement events only on valid state transitions

6. **Test Requirements**: Three specific test scenarios:
   - Stationary test: Alternating reads should show stability, no movement events
   - Movement test: RSSI crossover should trigger exactly one movement event
   - Ghost test: Short-lived reads should be filtered out

I framed the problem in three layers:

**Signal Processing Layer**: RSSI smoothing, weighted averaging, threshold detection

**State Management Layer**: Finite state machine for zone tracking, hysteresis for stability

**Event Detection Layer**: Directionality logic, debouncing, temporal filtering

## Strategy: Why This Design and Patterns Were Chosen

### Standard Library Only Approach

The constraint against data science libraries was actually beneficial - it forced a clean, dependency-free implementation. I used:
- `collections.deque` for efficient sliding window operations (O(1) append/popleft)
- `dataclasses` for clean data structures (RSSIReading, TagSession)
- `enum.Enum` for type-safe zone and direction constants
- Standard Python arithmetic for weighted average calculations

This approach ensures the code can run in any Python 3.10+ environment without external dependencies.

Sliding Window Weighted Average Algorithm

I chose an exponential decay weighted average rather than a simple moving average because:
- Recent RSSI readings are more indicative of current tag position
- Exponential decay (weight_decay=0.9) gives smooth transitions while remaining responsive
- More computationally efficient than recalculating full averages each time
- Better handles signal noise by weighting recent measurements higher

The implementation uses `weight = decay_factor ^ (window_size - index - 1)`, ensuring the most recent reading has the highest weight.

### Finite State Machine with Hysteresis

The state machine design prevents rapid flickering when tags are equidistant between antennas:

**Without Hysteresis**: A tag at the boundary would rapidly switch between zones as RSSI values fluctuate slightly.

**With Hysteresis**: Once a zone is established, switching requires a larger RSSI delta (threshold + hysteresis_delta). This creates a "dead band" that prevents oscillation.

The state machine tracks:
- `UNKNOWN` → Initial state, no zone assigned
- `ANTENNA_1` → Tag is at dock door
- `ANTENNA_2` → Tag is at warehouse interior

Transitions only occur when:
1. Session duration exceeds debounce threshold (filters ghosts)
2. RSSI delta exceeds threshold + hysteresis (prevents flickering)
3. Previous zone was not UNKNOWN (ensures valid movement, not initial detection)

 Debouncing Strategy

Ghost reads (fleeting detections < 200ms) are filtered by:
- Only assigning zones after debounce threshold is met
- Keeping zone as UNKNOWN for short-lived sessions
- Stale tag purging removes ghosts that never reach threshold

This prevents false movement events from transient signal reflections.

 Cross-Read Suppression Logic

The core algorithm compares smoothed RSSI values:
```
rssi_delta = smoothed_rssi_antenna_1 - smoothed_rssi_antenna_2

if rssi_delta > threshold:
    zone = ANTENNA_1
elif rssi_delta < -threshold:
    zone = ANTENNA_2
else:
    zone = UNKNOWN (or maintain current zone with hysteresis)
```

This handles the multipath problem where both antennas detect the tag, but with different signal strengths.

Out-of-Order Timestamp Handling

RFID readers may send reads out of order. The solution:
- Store all readings in a deque
- Sort by timestamp before processing (maintains window size)
- Ensures chronological processing regardless of arrival order

 Session-Based Architecture

Each tag maintains its own `TagSession` object containing:
- Sliding window of RSSI readings
- Current and previous zone states
- First and last read timestamps
- Session duration tracking

This isolation ensures:
- Multiple tags can be tracked simultaneously
- Each tag's state is independent
- Memory leaks are prevented through stale tag purging

 Execution: Step-by-Step Implementation

 Phase 1: Core Data Structures

1. **Defined Enums**: `MovementDirection` (INBOUND/OUTBOUND) and `AntennaZone` (ANTENNA_1/ANTENNA_2/UNKNOWN)
2. **Created RSSIReading dataclass**: Immutable record of timestamp, antenna_id, and RSSI value
3. **Designed TagSession dataclass**: State container with deque for readings, zone tracking, and timestamp management

### Phase 2: Signal Processing Implementation

1. **Implemented sliding window maintenance**: 
   - Added readings to deque
   - Enforced window_size limit with popleft()
   - Sorted readings by timestamp for out-of-order handling

2. **Built weighted average calculation**:
   - Separated readings by antenna_id
   - Applied exponential decay weighting
   - Handled edge cases (no readings, single reading)

3. **Created zone determination logic**:
   - Calculated RSSI delta between antennas
   - Applied hysteresis based on current zone
   - Handled cases where one antenna has no readings

Phase 3: State Machine and Event Detection

1. **Implemented debouncing**:
   - Checked session duration before zone assignment
   - Kept zone as UNKNOWN for short sessions
   - Only emitted events after debounce threshold

2. **Added hysteresis loop**:
   - Different thresholds for entering vs. maintaining zones
   - Prevented rapid state switching
   - Maintained stability during transitions

3. **Built directionality detection**:
   - Detected transitions from ANTENNA_1 → ANTENNA_2 (INBOUND)
   - Detected transitions from ANTENNA_2 → ANTENNA_1 (OUTBOUND)
   - Only emitted events on valid state transitions

 Phase 4: Memory Management

1. **Implemented stale tag purging**:
   - Checked tag staleness before each read
   - Removed tags inactive for > 3 seconds
   - Prevented memory leaks in long-running systems

Phase 5: Testing Infrastructure

1. **Created comprehensive test suite**:
   - 11 test classes covering all requirements
   - Stationary, movement, and ghost test scenarios
   - Edge case testing (out-of-order, single antenna, rapid switching)

2. **Built evaluation script**:
   - Runs tests against repository_before and repository_after
   - Generates JSON report with comparison
   - Docker-based execution for consistency

3. **Updated test file for REPO_PATH**:
   - Made tests work with both baseline and implementation
   - Used environment variable for dynamic import path

 Phase 6: Documentation and Docker Integration

1. **Created README with Docker commands**:
   - Three commands for before/after/evaluation
   - Verbose output with pass/fail indicators
   - PowerShell-compatible syntax

2. **Added test documentation**:
   - README in tests folder
   - Explanation of test coverage
   - Running instructions

Resources: Documentation and Concepts Used

 Signal Processing & Digital Filtering

**Sliding Window Algorithms**:
- Concept: Moving average filters for time-series data
- Implementation: Used deque for O(1) window operations
- Reference: Standard DSP techniques for noise reduction

**Exponential Weighted Moving Average (EWMA)**:
- Concept: Weighting recent samples more heavily
- Implementation: `weight = decay_factor ^ (window_size - index - 1)`
- Reference: Common in financial and sensor data analysis

### State Machine Design

**Finite State Machines**:
- Concept: State transitions based on conditions
- Implementation: AntennaZone enum with transition logic
- Reference: Standard CS pattern for event-driven systems

**Hysteresis Loop**:
- Concept: Different thresholds for entering vs. leaving states
- Implementation: threshold + hysteresis_delta for state changes
- Reference: Control systems engineering, prevents oscillation
- Wikipedia: https://en.wikipedia.org/wiki/Hysteresis

### Python Standard Library

**collections.deque**:
- Documentation: https://docs.python.org/3/library/collections.html#collections.deque
- Usage: Efficient sliding window with O(1) operations
- Why: Better than list for frequent append/popleft operations

**dataclasses**:
- Documentation: https://docs.python.org/3/library/dataclasses.html
- Usage: Clean data structures for RSSIReading and TagSession
- Why: Reduces boilerplate, improves readability

**enum.Enum**:
- Documentation: https://docs.python.org/3/library/enum.html
- Usage: Type-safe constants for zones and directions
- Why: Prevents magic strings, improves type checking

**typing Module**:
- Documentation: https://docs.python.org/3/library/typing.html
- Usage: Type hints for function signatures
- Why: Improves code clarity and IDE support

### RFID & RSSI Concepts

**RSSI (Received Signal Strength Indicator)**:
- Concept: Signal strength measurement in dBm
- Implementation: Negative values (stronger = less negative)
- Reference: IEEE 802.11 standard, RFID protocols

**Multipath Propagation**:
- Concept: Signal reflections cause multiple reception paths
- Problem: Tags detected by multiple antennas simultaneously
- Solution: RSSI comparison to determine true location
- Reference: Wireless communication theory

**Debouncing**:
- Concept: Filtering transient signals
- Implementation: Minimum duration threshold (200ms)
- Reference: Digital electronics, switch debouncing
- Wikipedia: https://en.wikipedia.org/wiki/Switch#Contact_bounce

### Testing & Evaluation

**Python unittest Framework**:
- Documentation: https://docs.python.org/3/library/unittest.html
- Usage: Test discovery, assertions, test organization
- Why: Built-in, no dependencies required

**Docker & Docker Compose**:
- Documentation: https://docs.docker.com/
- Usage: Consistent test environment, isolation
- Why: Reproducible builds, CI/CD compatibility

**Test-Driven Development**:
- Concept: Write tests before/during implementation
- Implementation: Comprehensive test suite covering all requirements
- Reference: TDD best practices

### Software Engineering Patterns

**Separation of Concerns**:
- Data structures (RSSIReading, TagSession)
- Signal processing (weighted average, smoothing)
- State management (zone determination, transitions)
- Event detection (directionality, debouncing)

**Configuration via Constructor**:
- All thresholds and parameters configurable
- Sensible defaults provided
- Allows tuning for different environments

**Memory Management**:
- Stale tag purging prevents memory leaks
- Bounded sliding windows limit memory growth
- Session-based isolation prevents cross-contamination

## Final Notes

This implementation prioritizes correctness and robustness over convenience. Key decisions were driven by:

1. **Real-world constraints**: No external dependencies, handle noisy data, prevent false positives
2. **Performance considerations**: O(1) deque operations, efficient weighted averages
3. **Maintainability**: Clear separation of concerns, comprehensive tests, type hints
4. **Deployability**: Docker-based testing, environment variable configuration

The solution successfully addresses all 11 requirements while maintaining clean, readable code that can be easily understood, tested, and deployed in a production IoT environment.
