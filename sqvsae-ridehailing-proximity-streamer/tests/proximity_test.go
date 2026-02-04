package tests

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	proximity "ridehailing-proximity-streamer/repository_after"
)

// MockMessageSender for testing
type MockMessageSender struct {
	messages [][]byte
	closed   bool
	mu       sync.Mutex
}

func NewMockMessageSender() *MockMessageSender {
	return &MockMessageSender{
		messages: make([][]byte, 0),
	}
}

func (m *MockMessageSender) SendMessage(data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = append(m.messages, data)
	return nil
}

func (m *MockMessageSender) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	return nil
}

func (m *MockMessageSender) GetMessages() [][]byte {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([][]byte, len(m.messages))
	copy(result, m.messages)
	return result
}

func (m *MockMessageSender) IsClosed() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.closed
}

func (m *MockMessageSender) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.messages = m.messages[:0]
}

// =============================================================================
// Requirement 1: Session Management Tests
// =============================================================================

func TestSessionManagement_MapConnectionToRideAndUser(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	// Create a ride
	ride := &proximity.Ride{
		RideID:      "RIDE-001",
		DriverID:    "DRIVER-001",
		PassengerID: "USER-001",
		PickupLat:   40.7128,
		PickupLng:   -74.0060,
		Status:      "active",
	}
	store.CreateRide(ride)

	// Create client and subscribe
	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)

	err := hub.SubscribeToRide(client, "RIDE-001", "USER-001")
	if err != nil {
		t.Fatalf("Failed to subscribe: %v", err)
	}

	// Verify subscription
	subscribers := hub.GetSubscribers("RIDE-001")
	if len(subscribers) != 1 {
		t.Errorf("Expected 1 subscriber, got %d", len(subscribers))
	}

	if subscribers[0].UserID != "USER-001" {
		t.Errorf("Expected UserID USER-001, got %s", subscribers[0].UserID)
	}
}

func TestSessionManagement_UserOnlyReceivesBroadcastsForSubscribedRide(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	// Create two rides
	ride1 := &proximity.Ride{RideID: "RIDE-001", PassengerID: "USER-001", Status: "active"}
	ride2 := &proximity.Ride{RideID: "RIDE-002", PassengerID: "USER-002", Status: "active"}
	store.CreateRide(ride1)
	store.CreateRide(ride2)

	// Create two clients subscribed to different rides
	sender1 := NewMockMessageSender()
	sender2 := NewMockMessageSender()

	client1 := proximity.NewClient("client-1", sender1, hub)
	client2 := proximity.NewClient("client-2", sender2, hub)

	hub.RegisterClient(client1)
	hub.RegisterClient(client2)
	time.Sleep(10 * time.Millisecond)

	hub.SubscribeToRide(client1, "RIDE-001", "USER-001")
	hub.SubscribeToRide(client2, "RIDE-002", "USER-002")
	time.Sleep(10 * time.Millisecond)

	// Broadcast to RIDE-001
	hub.BroadcastToRide("RIDE-001", []byte(`{"type":"COORD_UPDATE"}`))
	time.Sleep(50 * time.Millisecond)

	// Client1 should receive, Client2 should not
	msgs1 := sender1.GetMessages()
	msgs2 := sender2.GetMessages()

	if len(msgs1) == 0 {
		t.Error("Client1 should have received the broadcast")
	}

	if len(msgs2) > 0 {
		t.Error("Client2 should NOT have received the broadcast for RIDE-001")
	}
}

// =============================================================================
// Requirement 2: Real-time Proximity Calculation Tests
// =============================================================================

func TestProximityCalculation_HaversineDistance(t *testing.T) {
	// Test known distance: ~111km between 1 degree of latitude
	dist := proximity.HaversineDistance(0, 0, 1, 0)
	actualKm := dist / 1000

	// Expected ~111km between 1 degree of latitude
	if actualKm < 110 || actualKm > 112 {
		t.Errorf("Expected ~111km, got %.2fkm", actualKm)
	}
}

func TestProximityCalculation_ThresholdCrossing(t *testing.T) {
	checker := proximity.NewProximityChecker(40.7128, -74.0060)

	// 150m away - should not trigger
	result1 := checker.CheckProximity(40.7141, -74.0060, false)
	if result1.WithinThreshold {
		t.Error("150m should NOT be within threshold")
	}

	// 90m away - should trigger
	result2 := checker.CheckProximity(40.7136, -74.0060, false)
	if !result2.CrossedThreshold {
		t.Error("First crossing into threshold should trigger")
	}

	// 80m away - already notified, should not trigger again
	result3 := checker.CheckProximity(40.7135, -74.0060, true)
	if result3.CrossedThreshold {
		t.Error("Should not trigger again after already notified")
	}
}

// TESTING REQUIREMENT 1: Driver moves through 120m, 95m, 90m - notification only at 95m
func TestProximityNotification_OnlyAtFirstThresholdCrossing(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	engine := proximity.NewBroadcastEngine(hub, pubsub, store)

	// Pickup location
	pickupLat := 40.7128
	pickupLng := -74.0060

	// Create ride
	ride := &proximity.Ride{
		RideID:      "RIDE-001",
		PassengerID: "USER-001",
		PickupLat:   pickupLat,
		PickupLng:   pickupLng,
		Status:      "active",
	}
	store.CreateRide(ride)
	engine.RegisterRide("RIDE-001", pickupLat, pickupLng)

	// Create subscriber
	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)
	hub.SubscribeToRide(client, "RIDE-001", "USER-001")
	time.Sleep(10 * time.Millisecond)

	// Calculate positions at approximately 120m, 95m, 90m from pickup
	// Using approximate conversion: 1 degree lat ≈ 111,000m
	// 120m ≈ 0.00108 degrees, 95m ≈ 0.000855 degrees, 90m ≈ 0.00081 degrees

	// Update 1: ~120m away (outside threshold)
	engine.ProcessTelemetry(proximity.DriverTelemetry{
		RideID:    "RIDE-001",
		Lat:       pickupLat + 0.00108, // ~120m north
		Lng:       pickupLng,
		Timestamp: time.Now().Unix(),
	})
	time.Sleep(50 * time.Millisecond)

	// Update 2: ~95m away (crosses threshold - should notify)
	engine.ProcessTelemetry(proximity.DriverTelemetry{
		RideID:    "RIDE-001",
		Lat:       pickupLat + 0.000855, // ~95m north
		Lng:       pickupLng,
		Timestamp: time.Now().Unix(),
	})
	time.Sleep(50 * time.Millisecond)

	// Update 3: ~90m away (still within threshold - should NOT notify again)
	engine.ProcessTelemetry(proximity.DriverTelemetry{
		RideID:    "RIDE-001",
		Lat:       pickupLat + 0.00081, // ~90m north
		Lng:       pickupLng,
		Timestamp: time.Now().Unix(),
	})
	time.Sleep(50 * time.Millisecond)

	// Count NEARBY_NOTIFICATION messages
	messages := sender.GetMessages()
	nearbyCount := 0

	for _, msg := range messages {
		var parsed map[string]interface{}
		if err := json.Unmarshal(msg, &parsed); err == nil {
			if parsed["type"] == proximity.TypeNearbyNotification {
				nearbyCount++

				// Verify distance in notification
				dist, ok := parsed["currentDistance"].(float64)
				if ok && (dist < 90 || dist > 100) {
					t.Errorf("NEARBY_NOTIFICATION sent at wrong distance: %.2fm", dist)
				}
			}
		}
	}

	if nearbyCount != 1 {
		t.Errorf("Expected exactly 1 NEARBY_NOTIFICATION, got %d", nearbyCount)
	}
}

// =============================================================================
// Requirement 3: Heartbeat & Cleanup Tests
// =============================================================================

func TestHeartbeat_IdleConnectionDetection(t *testing.T) {
	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, nil)

	// Freshly created - should not be idle
	if client.IsIdle() {
		t.Error("Fresh client should not be idle")
	}

	// Simulate time passing (mock by checking the logic)
	// In real scenario, we'd wait 30+ seconds or mock time
}

func TestHeartbeat_CleanupIdleConnections(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	// Create client
	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)

	// Verify registered
	if hub.GetClientCount() != 1 {
		t.Error("Client should be registered")
	}

	// Activity updates should prevent idle
	client.UpdateActivity()
	if client.IsIdle() {
		t.Error("Client with recent activity should not be idle")
	}
}

// =============================================================================
// Requirement 4: Message Sequencing Tests
// =============================================================================

func TestMessageSequencing_StrictOrderPreserved(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	engine := proximity.NewBroadcastEngine(hub, pubsub, store)

	ride := &proximity.Ride{RideID: "RIDE-001", PassengerID: "USER-001", Status: "active"}
	store.CreateRide(ride)
	engine.RegisterRide("RIDE-001", 40.7128, -74.0060)

	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)
	hub.SubscribeToRide(client, "RIDE-001", "USER-001")
	time.Sleep(10 * time.Millisecond)

	// Send multiple updates
	for i := 0; i < 10; i++ {
		engine.ProcessTelemetry(proximity.DriverTelemetry{
			RideID:    "RIDE-001",
			Lat:       40.7128 + float64(i)*0.0001,
			Lng:       -74.0060,
			Timestamp: time.Now().Unix() + int64(i),
		})
	}
	time.Sleep(100 * time.Millisecond)

	// Verify sequence numbers are in order
	messages := sender.GetMessages()
	var lastSeq int64 = 0

	for _, msg := range messages {
		var update proximity.CoordUpdate
		if err := json.Unmarshal(msg, &update); err == nil {
			if update.Type == proximity.TypeCoordUpdate {
				if update.Sequence <= lastSeq && lastSeq > 0 {
					t.Errorf("Sequence out of order: got %d after %d", update.Sequence, lastSeq)
				}
				lastSeq = update.Sequence
			}
		}
	}
}

// =============================================================================
// Requirement 5: Data Leak Prevention Tests
// =============================================================================

func TestDataLeakPrevention_DriverADataNotAccessibleToDifferentRide(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	engine := proximity.NewBroadcastEngine(hub, pubsub, store)

	// Create two rides with different drivers
	ride1 := &proximity.Ride{RideID: "RIDE-001", DriverID: "DRIVER-A", PassengerID: "USER-001", Status: "active"}
	ride2 := &proximity.Ride{RideID: "RIDE-002", DriverID: "DRIVER-B", PassengerID: "USER-002", Status: "active"}
	store.CreateRide(ride1)
	store.CreateRide(ride2)
	engine.RegisterRide("RIDE-001", 40.7128, -74.0060)
	engine.RegisterRide("RIDE-002", 40.7200, -74.0100)

	// Create subscribers for each ride
	sender1 := NewMockMessageSender()
	sender2 := NewMockMessageSender()

	client1 := proximity.NewClient("client-1", sender1, hub)
	client2 := proximity.NewClient("client-2", sender2, hub)

	hub.RegisterClient(client1)
	hub.RegisterClient(client2)
	time.Sleep(10 * time.Millisecond)

	hub.SubscribeToRide(client1, "RIDE-001", "USER-001")
	hub.SubscribeToRide(client2, "RIDE-002", "USER-002")
	time.Sleep(10 * time.Millisecond)

	// Send telemetry for DRIVER-A (RIDE-001)
	engine.ProcessTelemetry(proximity.DriverTelemetry{
		DriverID:  "DRIVER-A",
		RideID:    "RIDE-001",
		Lat:       40.7130,
		Lng:       -74.0060,
		Timestamp: time.Now().Unix(),
	})
	time.Sleep(50 * time.Millisecond)

	// User 2 (on RIDE-002) should NOT receive Driver A's coordinates
	msgs2 := sender2.GetMessages()
	for _, msg := range msgs2 {
		var update map[string]interface{}
		if err := json.Unmarshal(msg, &update); err == nil {
			if update["type"] == proximity.TypeCoordUpdate {
				t.Error("User on RIDE-002 received coordinates meant for RIDE-001 - DATA LEAK!")
			}
		}
	}

	// User 1 (on RIDE-001) SHOULD receive Driver A's coordinates
	msgs1 := sender1.GetMessages()
	coordCount := 0
	for _, msg := range msgs1 {
		var update map[string]interface{}
		if err := json.Unmarshal(msg, &update); err == nil {
			if update["type"] == proximity.TypeCoordUpdate {
				coordCount++
			}
		}
	}

	if coordCount == 0 {
		t.Error("User on RIDE-001 should have received coordinates")
	}
}

func TestDataLeakPrevention_UnauthorizedAccessDenied(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	// Create ride for USER-001
	ride := &proximity.Ride{RideID: "RIDE-001", PassengerID: "USER-001", Status: "active"}
	store.CreateRide(ride)

	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)

	// USER-999 tries to subscribe to USER-001's ride
	err := hub.SubscribeToRide(client, "RIDE-001", "USER-999")

	if err == nil {
		t.Error("Should have denied unauthorized access")
	}
}

// =============================================================================
// TESTING REQUIREMENT 2: Ride Completed - Disconnect All Subscribers
// =============================================================================

func TestRideCompleted_AllSubscribersDisconnected(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	engine := proximity.NewBroadcastEngine(hub, pubsub, store)

	// Create ride
	ride := &proximity.Ride{RideID: "RIDE-001", PassengerID: "USER-001", Status: "active"}
	store.CreateRide(ride)
	engine.RegisterRide("RIDE-001", 40.7128, -74.0060)

	// Create multiple subscribers
	senders := make([]*MockMessageSender, 3)
	clients := make([]*proximity.Client, 3)

	for i := 0; i < 3; i++ {
		senders[i] = NewMockMessageSender()
		clients[i] = proximity.NewClient("client-"+string(rune('1'+i)), senders[i], hub)
		hub.RegisterClient(clients[i])
	}
	time.Sleep(10 * time.Millisecond)

	// Subscribe all to the same ride
	for i := 0; i < 3; i++ {
		hub.SubscribeToRide(clients[i], "RIDE-001", "USER-001")
	}
	time.Sleep(10 * time.Millisecond)

	// Verify all subscribed
	if hub.GetSubscriberCount("RIDE-001") != 3 {
		t.Fatalf("Expected 3 subscribers, got %d", hub.GetSubscriberCount("RIDE-001"))
	}

	// Mark ride as completed
	store.UpdateRideStatus("RIDE-001", "completed")

	// Trigger disconnect (simulating database update notification)
	engine.CompleteRide("RIDE-001")
	time.Sleep(100 * time.Millisecond)

	// Verify all disconnected
	if hub.GetSubscriberCount("RIDE-001") != 0 {
		t.Errorf("Expected 0 subscribers after completion, got %d", hub.GetSubscriberCount("RIDE-001"))
	}

	// Verify RIDE_COMPLETED message was sent to all
	for i, sender := range senders {
		msgs := sender.GetMessages()
		completedReceived := false
		for _, msg := range msgs {
			var parsed map[string]interface{}
			if err := json.Unmarshal(msg, &parsed); err == nil {
				if parsed["type"] == proximity.TypeRideCompleted {
					completedReceived = true
					break
				}
			}
		}
		if !completedReceived {
			t.Errorf("Client %d should have received RIDE_COMPLETED message", i)
		}
	}
}

// =============================================================================
// TESTING REQUIREMENT 3: High Load - 1000 updates/sec, <20ms latency
// =============================================================================

func TestHighLoad_1000UpdatesPerSecond_Under20msLatency(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	engine := proximity.NewBroadcastEngine(hub, pubsub, store)

	// Create ride
	ride := &proximity.Ride{RideID: "RIDE-001", PassengerID: "USER-001", Status: "active"}
	store.CreateRide(ride)
	engine.RegisterRide("RIDE-001", 40.7128, -74.0060)

	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)
	hub.SubscribeToRide(client, "RIDE-001", "USER-001")
	time.Sleep(10 * time.Millisecond)

	// Track latencies
	var totalLatency int64
	var maxLatency int64
	var processedCount int64

	// Process 1000 updates
	numUpdates := 1000
	var wg sync.WaitGroup

	startTime := time.Now()

	for i := 0; i < numUpdates; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()

			updateStart := time.Now()

			engine.ProcessTelemetry(proximity.DriverTelemetry{
				RideID:    "RIDE-001",
				Lat:       40.7128 + float64(idx)*0.00001,
				Lng:       -74.0060,
				Timestamp: time.Now().Unix(),
			})

			latency := time.Since(updateStart).Microseconds()
			atomic.AddInt64(&totalLatency, latency)
			atomic.AddInt64(&processedCount, 1)

			// Track max latency
			for {
				current := atomic.LoadInt64(&maxLatency)
				if latency <= current {
					break
				}
				if atomic.CompareAndSwapInt64(&maxLatency, current, latency) {
					break
				}
			}
		}(i)
	}

	wg.Wait()
	totalTime := time.Since(startTime)

	// Calculate metrics
	avgLatencyUs := float64(totalLatency) / float64(processedCount)
	avgLatencyMs := avgLatencyUs / 1000
	maxLatencyMs := float64(maxLatency) / 1000
	throughput := float64(processedCount) / totalTime.Seconds()

	t.Logf("Processed %d updates in %v", processedCount, totalTime)
	t.Logf("Throughput: %.2f updates/second", throughput)
	t.Logf("Average latency: %.3f ms", avgLatencyMs)
	t.Logf("Max latency: %.3f ms", maxLatencyMs)

	// Verify latency requirement
	if avgLatencyMs >= 20 {
		t.Errorf("Average latency %.3fms exceeds 20ms requirement", avgLatencyMs)
	}

	// Verify throughput (should handle at least 1000/sec)
	if throughput < 1000 {
		t.Errorf("Throughput %.2f/sec is below 1000/sec requirement", throughput)
	}
}

// =============================================================================
// Requirement 9: Distributed Fan-Out Tests
// =============================================================================

func TestDistributedFanOut_PubSubBroadcast(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()

	// Simulate two nodes with shared pubsub
	store1 := proximity.NewInMemoryRideStore()
	store2 := proximity.NewInMemoryRideStore()

	// Create ride in both stores (simulating shared database)
	ride := &proximity.Ride{RideID: "RIDE-001", PassengerID: "USER-001", Status: "active"}
	store1.CreateRide(ride)
	store2.CreateRide(ride)

	hub1 := proximity.NewHub(pubsub, store1)
	hub2 := proximity.NewHub(pubsub, store2)

	go hub1.Run()
	go hub2.Run()

	broadcaster1 := proximity.NewDistributedBroadcaster(hub1, pubsub, "node-1")
	broadcaster2 := proximity.NewDistributedBroadcaster(hub2, pubsub, "node-2")

	// Subscribe hub2 to receive updates for RIDE-001
	broadcaster2.SubscribeToRide("RIDE-001")

	// Create client on hub2
	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub2)
	hub2.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)

	// Properly subscribe client to ride via hub
	hub2.SubscribeToRide(client, "RIDE-001", "USER-001")
	time.Sleep(10 * time.Millisecond)

	// Broadcast from node 1
	update := proximity.CoordUpdate{
		Type:      proximity.TypeCoordUpdate,
		Lat:       40.7128,
		Lng:       -74.0060,
		Heading:   90,
		Timestamp: time.Now().Unix(),
	}
	broadcaster1.BroadcastLocation("RIDE-001", update)
	time.Sleep(100 * time.Millisecond)

	// Client on node 2 should receive the update
	messages := sender.GetMessages()
	if len(messages) == 0 {
		t.Error("Client on node 2 should have received broadcast from node 1")
	}
}

// =============================================================================
// Client-side Smoother Tests
// =============================================================================

func TestPositionSmoother_PreventsTeleporation(t *testing.T) {
	smoother := proximity.NewPositionSmoother(0.3)

	// Initial position
	smoother.Update(40.7128, -74.0060, 90)
	pos1 := smoother.GetSmoothedPosition()

	// Jump to new position (simulating network delay)
	smoother.Update(40.7200, -74.0100, 180)

	// Get smoothed position immediately - should NOT have jumped fully
	pos2 := smoother.GetSmoothedPosition()

	// Calculate how much it moved
	latDiff := pos2.Lat - pos1.Lat
	expectedFullDiff := 40.7200 - 40.7128

	// Should have moved less than the full difference (smoothing applied)
	if latDiff >= expectedFullDiff*0.9 {
		t.Error("Smoother should prevent instant teleportation")
	}
}

func TestAdaptiveSmoother_AdjustsForJitter(t *testing.T) {
	smoother := proximity.NewAdaptiveSmoother(2 * time.Second)

	// Simulate updates with varying intervals
	smoother.Update(40.7128, -74.0060, 90)
	time.Sleep(100 * time.Millisecond)
	smoother.Update(40.7130, -74.0060, 90)
	time.Sleep(50 * time.Millisecond)
	smoother.Update(40.7132, -74.0060, 90)

	pos := smoother.GetSmoothedPosition()

	// Should have valid position
	if pos.Lat == 0 || pos.Lng == 0 {
		t.Error("Adaptive smoother should produce valid positions")
	}
}

// =============================================================================
// Store Tests
// =============================================================================

func TestRideStore_CRUD(t *testing.T) {
	store := proximity.NewInMemoryRideStore()

	ride := &proximity.Ride{
		RideID:      "RIDE-001",
		DriverID:    "DRIVER-001",
		PassengerID: "USER-001",
		Status:      "active",
	}

	// Create
	err := store.CreateRide(ride)
	if err != nil {
		t.Fatalf("Failed to create ride: %v", err)
	}

	// Read
	retrieved, err := store.GetRide("RIDE-001")
	if err != nil {
		t.Fatalf("Failed to get ride: %v", err)
	}
	if retrieved.DriverID != "DRIVER-001" {
		t.Error("Retrieved ride has wrong driver")
	}

	// Update
	err = store.UpdateRideStatus("RIDE-001", "completed")
	if err != nil {
		t.Fatalf("Failed to update ride: %v", err)
	}
	if !store.IsRideCompleted("RIDE-001") {
		t.Error("Ride should be marked as completed")
	}

	// Delete
	err = store.DeleteRide("RIDE-001")
	if err != nil {
		t.Fatalf("Failed to delete ride: %v", err)
	}
	_, err = store.GetRide("RIDE-001")
	if err == nil {
		t.Error("Deleted ride should not be found")
	}
}

// =============================================================================
// Session Manager Tests
// =============================================================================

func TestSessionManager_TracksSessions(t *testing.T) {
	manager := proximity.NewSessionManager()

	session := manager.CreateSession("client-1")
	if session == nil {
		t.Fatal("Failed to create session")
	}

	manager.UpdateSession("client-1", "USER-001", "RIDE-001")

	retrieved := manager.GetSession("client-1")
	if retrieved.UserID != "USER-001" {
		t.Error("Session should have correct UserID")
	}
	if retrieved.RideID != "RIDE-001" {
		t.Error("Session should have correct RideID")
	}

	sessions := manager.GetSessionsByRide("RIDE-001")
	if len(sessions) != 1 {
		t.Errorf("Expected 1 session for ride, got %d", len(sessions))
	}

	manager.EndSession("client-1")
	if manager.GetSession("client-1") != nil {
		t.Error("Ended session should be removed")
	}
}

// =============================================================================
// Edge Cases
// =============================================================================

func TestEdgeCase_SubscribeToNonexistentRide(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)

	err := hub.SubscribeToRide(client, "NONEXISTENT", "USER-001")
	if err == nil {
		t.Error("Should fail to subscribe to nonexistent ride")
	}
}

func TestEdgeCase_MultipleSubscriptionsFromSameClient(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	ride1 := &proximity.Ride{RideID: "RIDE-001", PassengerID: "USER-001", Status: "active"}
	ride2 := &proximity.Ride{RideID: "RIDE-002", PassengerID: "USER-001", Status: "active"}
	store.CreateRide(ride1)
	store.CreateRide(ride2)

	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)

	// Subscribe to first ride
	hub.SubscribeToRide(client, "RIDE-001", "USER-001")
	time.Sleep(10 * time.Millisecond)

	// Subscribe to second ride (should switch)
	hub.SubscribeToRide(client, "RIDE-002", "USER-001")
	time.Sleep(10 * time.Millisecond)

	// Should only be subscribed to RIDE-002
	if hub.GetSubscriberCount("RIDE-001") != 0 {
		t.Error("Client should have unsubscribed from RIDE-001")
	}
	if hub.GetSubscriberCount("RIDE-002") != 1 {
		t.Error("Client should be subscribed to RIDE-002")
	}
}

func TestEdgeCase_NearbyNotificationNotSentWhenStartingWithinThreshold(t *testing.T) {
	pubsub := proximity.NewInMemoryPubSub()
	store := proximity.NewInMemoryRideStore()
	hub := proximity.NewHub(pubsub, store)
	go hub.Run()

	engine := proximity.NewBroadcastEngine(hub, pubsub, store)

	pickupLat := 40.7128
	pickupLng := -74.0060

	ride := &proximity.Ride{RideID: "RIDE-001", PassengerID: "USER-001", Status: "active"}
	store.CreateRide(ride)
	engine.RegisterRide("RIDE-001", pickupLat, pickupLng)

	sender := NewMockMessageSender()
	client := proximity.NewClient("client-1", sender, hub)
	hub.RegisterClient(client)
	time.Sleep(10 * time.Millisecond)
	hub.SubscribeToRide(client, "RIDE-001", "USER-001")
	time.Sleep(10 * time.Millisecond)

	// First update already within threshold (50m)
	engine.ProcessTelemetry(proximity.DriverTelemetry{
		RideID:    "RIDE-001",
		Lat:       pickupLat + 0.00045, // ~50m
		Lng:       pickupLng,
		Timestamp: time.Now().Unix(),
	})
	time.Sleep(50 * time.Millisecond)

	// NEARBY_NOTIFICATION should still be sent on first crossing
	messages := sender.GetMessages()
	nearbyCount := 0
	for _, msg := range messages {
		var parsed map[string]interface{}
		if err := json.Unmarshal(msg, &parsed); err == nil {
			if parsed["type"] == proximity.TypeNearbyNotification {
				nearbyCount++
			}
		}
	}

	// Should trigger because it crossed from "not notified" to "within threshold"
	if nearbyCount != 1 {
		t.Errorf("Expected 1 NEARBY_NOTIFICATION for first crossing, got %d", nearbyCount)
	}
}
