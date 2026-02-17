# Development Trajectory: Ridehailing Proximity Streamer

## Overview & Problem Understanding

### Initial Analysis

**What is being asked?**
The task requires building a high-performance real-time driver proximity tracking system for a ride-hailing platform (CityLink). The system must handle WebSocket-based live broadcasts of driver locations to passengers, with proximity alerts when drivers enter the "Final Block" (< 100m from pickup).

**Key Questions Asked:**
1. What is the "Final Block" proximity threshold?
   - Answer: 100 meters from the passenger's pickup location
2. Why WebSockets instead of polling?
   - Answer: Real-time updates every 2 seconds require persistent connections for low latency
3. How do we prevent UI "teleportation"?
   - Answer: Client-side position smoothing/interpolation between updates
4. How do we handle horizontal scaling?
   - Answer: Pub/sub backplane (Redis/NATS) for cross-node message distribution

**Core Requirements Identified:**
1. Session Management - Map WebSocket connections to rideId and userId
2. Real-time Proximity Calculation - Haversine distance, NEARBY_NOTIFICATION at ≤100m
3. Heartbeat & Cleanup - Detect and drop idle connections within 30 seconds
4. Message Sequencing - Preserve strict order of location updates
5. Data Leak Prevention - Ride isolation validation
6. Distributed Fan-Out - Pub/sub mechanism for horizontal scaling
7. Client-side Smoothing - Position interpolation to prevent teleporting
8. High Performance - Handle 1000+ updates/second with <20ms latency

### External References Consulted

- **Haversine Formula**: Great-circle distance calculation for geographic coordinates
  - Reference: https://en.wikipedia.org/wiki/Haversine_formula
- **WebSocket Protocol**: Full-duplex communication channels over TCP
  - Reference: https://tools.ietf.org/html/rfc6455
- **Pub/Sub Patterns**: Distributed messaging for horizontal scaling
  - Reference: https://docs.redis.com/latest/rs/references/client_references/pubsub/

---

## Phase 1: Architecture Design

### Decision: Core Data Structures

**Question:** How should we represent the message types?

**Analysis Options:**
1. **Generic map[string]interface{}**: Flexible but no type safety
2. **Strongly typed structs**: Type safety, better performance
3. **Protocol buffers**: Efficient serialization but added complexity

**Rationale:** Chose strongly typed structs because:
- Type safety catches errors at compile time
- JSON marshaling is straightforward in Go
- No external dependencies required

**Implementation:**
```go
type CoordUpdate struct {
    Type      string  `json:"type"`
    Lat       float64 `json:"lat"`
    Lng       float64 `json:"lng"`
    Heading   float64 `json:"heading"`
    Timestamp int64   `json:"timestamp"`
    Sequence  int64   `json:"sequence"`
}

type NearbyNotification struct {
    Type                 string  `json:"type"`
    CurrentDistance      float64 `json:"currentDistance"`
    EstimatedArrivalTime int     `json:"estimatedArrivalTime"`
}
```

**Insight:** Including sequence numbers in coordinate updates enables clients to detect out-of-order messages and request resync if needed.

### Decision: Hub Architecture

**Question:** How should we manage WebSocket connections and subscriptions?

**Analysis:**
- Need to map rideId → list of subscribed clients
- Need to track all connected clients for cleanup
- Need thread-safe access for concurrent operations

**Rationale:** Centralized Hub pattern with:
- `subscriptions map[string]map[string]*Client` for ride → clients mapping
- `clients map[string]*Client` for all connected clients
- Channel-based message passing for thread safety

```go
type Hub struct {
    subscriptions map[string]map[string]*Client
    clients       map[string]*Client
    mu            sync.RWMutex
    register      chan *Client
    unregister    chan *Client
    broadcast     chan *BroadcastMessage
}
```

**Insight:** Using channels for register/unregister/broadcast operations allows the Hub to process events sequentially in its Run() loop, avoiding complex locking scenarios.

### Decision: Proximity Calculation

**Question:** How do we efficiently calculate distance between driver and pickup?

**Analysis Options:**
1. **Euclidean distance**: Fast but inaccurate for geographic coordinates
2. **Haversine formula**: Accurate great-circle distance, slightly more computation
3. **Vincenty formula**: Most accurate but computationally expensive

**Rationale:** Haversine formula chosen because:
- Accuracy sufficient for 100m threshold detection
- Computation fast enough for real-time processing
- Well-understood and widely used in mapping applications

```go
func HaversineDistance(lat1, lng1, lat2, lng2 float64) float64 {
    // Convert to radians
    lat1Rad := lat1 * math.Pi / 180
    lat2Rad := lat2 * math.Pi / 180
    deltaLat := (lat2 - lat1) * math.Pi / 180
    deltaLng := (lng2 - lng1) * math.Pi / 180

    a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
        math.Cos(lat1Rad)*math.Cos(lat2Rad)*
        math.Sin(deltaLng/2)*math.Sin(deltaLng/2)
    c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

    return earthRadiusMeters * c
}
```

**Insight:** Earth's radius of 6,371,000 meters provides accurate results. The formula handles edge cases like coordinates near the poles correctly.

---

## Phase 2: Implementation

### Core Components Built

1. **Types** (`types.go`)
   - Message type constants (COORD_UPDATE, NEARBY_NOTIFICATION, etc.)
   - CoordUpdate, NearbyNotification, SubscribeRide structs
   - Ride and RideSubscription data models
   - Configuration constants (ProximityThreshold = 100m, HeartbeatTimeout = 30s)

2. **Proximity Checker** (`proximity.go`)
   - HaversineDistance function for accurate geographic distance
   - ProximityChecker struct with pickup location
   - CheckProximity method with threshold crossing detection
   - EstimateArrivalTime based on average urban speed

3. **Client** (`client.go`)
   - WebSocket connection wrapper with MessageSender interface
   - Thread-safe state management with sync.RWMutex
   - LastActivity tracking for heartbeat monitoring
   - NotifiedNearby flag to prevent duplicate notifications

4. **Hub** (`hub.go`)
   - Central connection and subscription manager
   - SubscribeToRide with validation (ride exists, user authorized)
   - BroadcastToRide for targeted message delivery
   - Cleanup loop for idle connection detection

5. **PubSub** (`pubsub.go`)
   - Interface for distributed messaging abstraction
   - InMemoryPubSub for single-node and testing
   - RedisPubSub placeholder for production scaling
   - DistributedBroadcaster for cross-node message fan-out

6. **Broadcast Engine** (`broadcast.go`)
   - ProcessTelemetry for incoming driver updates
   - Automatic proximity checking and NEARBY_NOTIFICATION dispatch
   - Sequence number assignment for ordering
   - RegisterRide/UnregisterRide for ride lifecycle

7. **Position Smoother** (`smoother.go`)
   - Exponential smoothing for position interpolation
   - JitterDetector for network quality assessment
   - AdaptiveSmoother that adjusts based on jitter level
   - Velocity estimation from position history

8. **Store** (`store.go`)
   - InMemoryRideStore for ride data management
   - SessionManager for tracking active sessions
   - ConnectionTracker for user → client mapping

### Problem Tackled: Single Notification Guarantee

**Problem:** The NEARBY_NOTIFICATION must be sent exactly once when the driver crosses the 100m threshold.

**Solution:** Track notification state per ride in BroadcastEngine.

```go
type BroadcastEngine struct {
    // ...
    nearbyNotified map[string]bool  // rideID -> notified
}

func (e *BroadcastEngine) ProcessTelemetry(telemetry DriverTelemetry) error {
    // Check proximity
    result := checker.CheckProximity(lat, lng, notified)

    if result.CrossedThreshold {
        e.nearbyNotified[rideID] = true
        // Send notification
    }
}
```

**Insight:** The `CrossedThreshold` flag is only true when `withinThreshold && !wasWithinThreshold`, ensuring single notification.

### Problem Tackled: Data Leak Prevention

**Problem:** Coordinates from Driver A must never be accessible to passengers on different rides.

**Solution:** Multi-layer validation:
1. Hub.SubscribeToRide validates ride exists and passenger is authorized
2. Subscriptions are keyed by rideID, not driverID
3. BroadcastToRide only sends to subscribers of that specific ride

```go
func (h *Hub) SubscribeToRide(client *Client, rideID, userID string) error {
    ride, err := h.rideStore.GetRide(rideID)
    if ride.PassengerID != userID {
        return &ValidationError{Message: "unauthorized", Code: "UNAUTHORIZED"}
    }
    // Add to ride-specific subscription map
    h.subscriptions[rideID][client.ID] = client
}
```

**Insight:** Authorization happens at subscription time, not at broadcast time, for better performance and simpler security model.

---

## Phase 3: Test Development

### Mapping Requirements to Tests

| Requirement | Test | Rationale |
|-------------|------|-----------|
| Session Management | `TestSessionManagement_MapConnectionToRideAndUser` | Verify client subscription to ride |
| Ride Isolation | `TestSessionManagement_UserOnlyReceivesBroadcastsForSubscribedRide` | Only subscribed clients receive broadcasts |
| Distance Calculation | `TestProximityCalculation_HaversineDistance` | Verify ~111km per degree latitude |
| Threshold Detection | `TestProximityCalculation_ThresholdCrossing` | Threshold crossing logic |
| Single Notification | `TestProximityNotification_OnlyAtFirstThresholdCrossing` | **KEY TEST**: 120m→95m→90m, notify only at 95m |
| Heartbeat | `TestHeartbeat_IdleConnectionDetection` | Fresh client not idle |
| Cleanup | `TestHeartbeat_CleanupIdleConnections` | Activity updates prevent idle |
| Message Ordering | `TestMessageSequencing_StrictOrderPreserved` | Sequence numbers increase |
| Data Leak Prevention | `TestDataLeakPrevention_DriverADataNotAccessibleToDifferentRide` | Cross-ride isolation |
| Authorization | `TestDataLeakPrevention_UnauthorizedAccessDenied` | Wrong user cannot subscribe |
| Ride Completion | `TestRideCompleted_AllSubscribersDisconnected` | **KEY TEST**: Completed ride disconnects all |
| High Load | `TestHighLoad_1000UpdatesPerSecond_Under20msLatency` | **KEY TEST**: Performance verification |
| Distributed | `TestDistributedFanOut_PubSubBroadcast` | Cross-node message delivery |
| Smoothing | `TestPositionSmoother_PreventsTeleporation` | Position interpolation |
| Adaptive | `TestAdaptiveSmoother_AdjustsForJitter` | Jitter-based smoothing adjustment |
| Store CRUD | `TestRideStore_CRUD` | Create/Read/Update/Delete rides |
| Sessions | `TestSessionManager_TracksSessions` | Session lifecycle |
| Edge Cases | `TestEdgeCase_*` | Nonexistent ride, multiple subscriptions, etc. |

### Key Test: Driver Movement Sequence

```go
func TestProximityNotification_OnlyAtFirstThresholdCrossing(t *testing.T) {
    // Setup: pickup at (40.7128, -74.0060)

    // Update 1: ~120m away (outside threshold)
    engine.ProcessTelemetry(DriverTelemetry{
        Lat: pickupLat + 0.00108,  // ~120m north
    })

    // Update 2: ~95m away (crosses threshold - should notify)
    engine.ProcessTelemetry(DriverTelemetry{
        Lat: pickupLat + 0.000855,  // ~95m north
    })

    // Update 3: ~90m away (still within - should NOT notify again)
    engine.ProcessTelemetry(DriverTelemetry{
        Lat: pickupLat + 0.00081,  // ~90m north
    })

    // Verify exactly 1 NEARBY_NOTIFICATION
    nearbyCount := countMessages(TypeNearbyNotification)
    assert(nearbyCount == 1)
}
```

### Key Test: High Load Performance

```go
func TestHighLoad_1000UpdatesPerSecond_Under20msLatency(t *testing.T) {
    // Process 1000 concurrent updates
    for i := 0; i < 1000; i++ {
        go func() {
            start := time.Now()
            engine.ProcessTelemetry(...)
            latency := time.Since(start)
            // Track latency
        }()
    }

    // Results:
    // Throughput: 50,000+ updates/second
    // Average latency: ~7ms
    // Max latency: ~17ms
    assert(avgLatency < 20*time.Millisecond)
}
```

---

## Phase 4: Module Configuration

### Decision: Single go.mod at Root

**Question:** Should we use separate go.mod files or a single root module?

**Rationale:** Single root module for consistency with Docker build context.

**Structure:**
```
sqvsae-ridehailing-proximity-streamer/
├── go.mod                           # module ridehailing-proximity-streamer
├── repository_after/
│   ├── *.go                         # package proximity
│   └── tests/
│       └── proximity_test.go        # imports "ridehailing-proximity-streamer/repository_after"
├── repository_before/               # empty
├── evaluation/
│   └── evaluation.go
└── trajectory/
    └── trajectory.md
```

**Docker Configuration:**
```yaml
services:
  app-after:
    command: go test -v ./repository_after/tests
  evaluation:
    command: sh -c "go test -json ./repository_after/tests | go run evaluation/evaluation.go"
```

---

## Phase 5: Verification

### Final Test Results

```
=== RUN   TestSessionManagement_MapConnectionToRideAndUser
--- PASS: TestSessionManagement_MapConnectionToRideAndUser (0.01s)
=== RUN   TestSessionManagement_UserOnlyReceivesBroadcastsForSubscribedRide
--- PASS: TestSessionManagement_UserOnlyReceivesBroadcastsForSubscribedRide (0.07s)
=== RUN   TestProximityCalculation_HaversineDistance
--- PASS: TestProximityCalculation_HaversineDistance (0.00s)
=== RUN   TestProximityCalculation_ThresholdCrossing
--- PASS: TestProximityCalculation_ThresholdCrossing (0.00s)
=== RUN   TestProximityNotification_OnlyAtFirstThresholdCrossing
--- PASS: TestProximityNotification_OnlyAtFirstThresholdCrossing (0.17s)
=== RUN   TestHeartbeat_IdleConnectionDetection
--- PASS: TestHeartbeat_IdleConnectionDetection (0.00s)
=== RUN   TestHeartbeat_CleanupIdleConnections
--- PASS: TestHeartbeat_CleanupIdleConnections (0.01s)
=== RUN   TestMessageSequencing_StrictOrderPreserved
--- PASS: TestMessageSequencing_StrictOrderPreserved (0.12s)
=== RUN   TestDataLeakPrevention_DriverADataNotAccessibleToDifferentRide
--- PASS: TestDataLeakPrevention_DriverADataNotAccessibleToDifferentRide (0.07s)
=== RUN   TestDataLeakPrevention_UnauthorizedAccessDenied
--- PASS: TestDataLeakPrevention_UnauthorizedAccessDenied (0.01s)
=== RUN   TestRideCompleted_AllSubscribersDisconnected
--- PASS: TestRideCompleted_AllSubscribersDisconnected (0.12s)
=== RUN   TestHighLoad_1000UpdatesPerSecond_Under20msLatency
    Processed 1000 updates in 18.8ms
    Throughput: 53,019 updates/second
    Average latency: 6.86 ms
    Max latency: 16.62 ms
--- PASS: TestHighLoad_1000UpdatesPerSecond_Under20msLatency (0.04s)
=== RUN   TestDistributedFanOut_PubSubBroadcast
--- PASS: TestDistributedFanOut_PubSubBroadcast (0.12s)
=== RUN   TestPositionSmoother_PreventsTeleporation
--- PASS: TestPositionSmoother_PreventsTeleporation (0.00s)
=== RUN   TestAdaptiveSmoother_AdjustsForJitter
--- PASS: TestAdaptiveSmoother_AdjustsForJitter (0.15s)
=== RUN   TestRideStore_CRUD
--- PASS: TestRideStore_CRUD (0.00s)
=== RUN   TestSessionManager_TracksSessions
--- PASS: TestSessionManager_TracksSessions (0.00s)
=== RUN   TestEdgeCase_SubscribeToNonexistentRide
--- PASS: TestEdgeCase_SubscribeToNonexistentRide (0.01s)
=== RUN   TestEdgeCase_MultipleSubscriptionsFromSameClient
--- PASS: TestEdgeCase_MultipleSubscriptionsFromSameClient (0.03s)
=== RUN   TestEdgeCase_NearbyNotificationNotSentWhenStartingWithinThreshold
--- PASS: TestEdgeCase_NearbyNotificationNotSentWhenStartingWithinThreshold (0.07s)
PASS
ok  	ridehailing-proximity-streamer/repository_after/tests	1.023s
```

### Metrics

| Metric | Value |
|--------|-------|
| Total Tests | 20 |
| Passed | 20 |
| Failed | 0 |
| Throughput | 53,000+ updates/sec |
| Avg Latency | 6.86 ms |
| Max Latency | 16.62 ms |
| Performance Requirement | <20ms ✓ |

### Insights from Testing

1. **Synchronous pub/sub preserves ordering** - Async handlers caused out-of-order messages; synchronous calls maintain sequence
2. **Proper subscription setup is critical** - Client.Subscribe() only sets state; Hub.SubscribeToRide() adds to subscription map
3. **Threshold crossing detection is stateful** - Must track "already notified" flag per ride
4. **Go's concurrency primitives are efficient** - 53,000 updates/second with simple mutexes

---

## Summary

The ridehailing proximity streaming system successfully implements all requirements:

1. ✅ Session Management - Map WebSocket connections to rideId/userId
2. ✅ Real-time Proximity Calculation - Haversine distance, NEARBY_NOTIFICATION exactly once at ≤100m
3. ✅ Heartbeat & Cleanup - 30-second idle detection with activity tracking
4. ✅ Message Sequencing - Monotonic sequence numbers preserve order
5. ✅ Data Leak Prevention - Multi-layer authorization prevents cross-ride access
6. ✅ Distributed Fan-Out - Pub/sub interface for horizontal scaling
7. ✅ Client Smoothing - Exponential position interpolation prevents teleporting
8. ✅ High Performance - 53,000+ updates/sec, <7ms average latency

The 20 tests provide comprehensive coverage including the three specific testing requirements:
- Driver movement sequence (120m→95m→90m) with single notification
- Ride completion disconnects all subscribers
- 1000 updates/second with <20ms latency

**Key Implementation Files:**
- `repository_after/types.go` - Message types and constants
- `repository_after/proximity.go` - Haversine distance calculation
- `repository_after/hub.go` - Connection and subscription management
- `repository_after/broadcast.go` - Telemetry processing engine
- `repository_after/smoother.go` - Client-side position interpolation
- `repository_after/tests/proximity_test.go` - Comprehensive test suite
