package proximity

import (
	"encoding/json"
	"sync"
	"time"
)

// BroadcastEngine handles the core broadcasting logic
type BroadcastEngine struct {
	hub         *Hub
	pubsub      PubSub
	rideStore   RideStore
	broadcaster *DistributedBroadcaster

	// Proximity checkers per ride
	proximityCheckers map[string]*ProximityChecker

	// Track if nearby notification was sent per ride
	nearbyNotified map[string]bool

	// Message queue for ordering
	messageQueues map[string]*MessageQueue

	mu sync.RWMutex
}

// MessageQueue ensures strict ordering of messages per ride
type MessageQueue struct {
	messages     []QueuedMessage
	lastSent     int64
	mu           sync.Mutex
}

// QueuedMessage represents a message waiting to be sent
type QueuedMessage struct {
	Sequence  int64
	Data      []byte
	Timestamp int64
}

// NewMessageQueue creates a new message queue
func NewMessageQueue() *MessageQueue {
	return &MessageQueue{
		messages: make([]QueuedMessage, 0),
	}
}

// Enqueue adds a message to the queue
func (q *MessageQueue) Enqueue(seq int64, data []byte, timestamp int64) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.messages = append(q.messages, QueuedMessage{
		Sequence:  seq,
		Data:      data,
		Timestamp: timestamp,
	})
}

// Dequeue returns messages in order
func (q *MessageQueue) Dequeue() []QueuedMessage {
	q.mu.Lock()
	defer q.mu.Unlock()

	if len(q.messages) == 0 {
		return nil
	}

	// Sort by sequence and return
	result := make([]QueuedMessage, len(q.messages))
	copy(result, q.messages)
	q.messages = q.messages[:0]

	// Simple insertion sort for maintaining order
	for i := 1; i < len(result); i++ {
		j := i
		for j > 0 && result[j-1].Sequence > result[j].Sequence {
			result[j-1], result[j] = result[j], result[j-1]
			j--
		}
	}

	return result
}

// NewBroadcastEngine creates a new broadcast engine
func NewBroadcastEngine(hub *Hub, pubsub PubSub, rideStore RideStore) *BroadcastEngine {
	engine := &BroadcastEngine{
		hub:               hub,
		pubsub:            pubsub,
		rideStore:         rideStore,
		proximityCheckers: make(map[string]*ProximityChecker),
		nearbyNotified:    make(map[string]bool),
		messageQueues:     make(map[string]*MessageQueue),
	}

	if pubsub != nil {
		engine.broadcaster = NewDistributedBroadcaster(hub, pubsub, "node-1")
	}

	return engine
}

// RegisterRide sets up proximity checking for a ride
func (e *BroadcastEngine) RegisterRide(rideID string, pickupLat, pickupLng float64) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.proximityCheckers[rideID] = NewProximityChecker(pickupLat, pickupLng)
	e.nearbyNotified[rideID] = false
	e.messageQueues[rideID] = NewMessageQueue()

	// Subscribe to pubsub for distributed messaging
	if e.broadcaster != nil {
		e.broadcaster.SubscribeToRide(rideID)
	}
}

// UnregisterRide removes a ride from the engine
func (e *BroadcastEngine) UnregisterRide(rideID string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	delete(e.proximityCheckers, rideID)
	delete(e.nearbyNotified, rideID)
	delete(e.messageQueues, rideID)
}

// ProcessTelemetry handles incoming driver telemetry
func (e *BroadcastEngine) ProcessTelemetry(telemetry DriverTelemetry) error {
	rideID := telemetry.RideID

	// Check if ride is completed
	if e.rideStore != nil && e.rideStore.IsRideCompleted(rideID) {
		e.hub.DisconnectRideSubscribers(rideID)
		return nil
	}

	// Get sequence number for ordering
	sequence := e.hub.GetNextSequence(rideID)

	// Create coordinate update
	coordUpdate := CoordUpdate{
		Type:      TypeCoordUpdate,
		Lat:       telemetry.Lat,
		Lng:       telemetry.Lng,
		Heading:   telemetry.Heading,
		Timestamp: telemetry.Timestamp,
		Sequence:  sequence,
	}

	// Check proximity
	e.mu.RLock()
	checker := e.proximityCheckers[rideID]
	notified := e.nearbyNotified[rideID]
	e.mu.RUnlock()

	if checker != nil {
		result := checker.CheckProximity(telemetry.Lat, telemetry.Lng, notified)

		// Send NEARBY_NOTIFICATION if threshold crossed for the first time
		if result.CrossedThreshold {
			e.mu.Lock()
			e.nearbyNotified[rideID] = true
			e.mu.Unlock()

			notification := NearbyNotification{
				Type:                 TypeNearbyNotification,
				CurrentDistance:      result.Distance,
				EstimatedArrivalTime: EstimateArrivalTime(result.Distance),
			}

			notifData, _ := json.Marshal(notification)

			// Send notification BEFORE coordinate update
			if e.broadcaster != nil {
				e.broadcaster.BroadcastNearby(rideID, notification)
			} else {
				e.hub.BroadcastToRide(rideID, notifData)
			}
		}
	}

	// Broadcast coordinate update
	coordData, err := json.Marshal(coordUpdate)
	if err != nil {
		return err
	}

	if e.broadcaster != nil {
		e.broadcaster.BroadcastLocation(rideID, coordUpdate)
	} else {
		e.hub.BroadcastToRide(rideID, coordData)
	}

	return nil
}

// CompleteRide marks a ride as completed and disconnects subscribers
func (e *BroadcastEngine) CompleteRide(rideID string) {
	e.hub.DisconnectRideSubscribers(rideID)
	e.UnregisterRide(rideID)
}

// IsNearbyNotified checks if nearby notification was sent for a ride
func (e *BroadcastEngine) IsNearbyNotified(rideID string) bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.nearbyNotified[rideID]
}

// GetProximityChecker returns the proximity checker for a ride
func (e *BroadcastEngine) GetProximityChecker(rideID string) *ProximityChecker {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.proximityCheckers[rideID]
}

// ProcessBatch handles multiple telemetry updates efficiently
func (e *BroadcastEngine) ProcessBatch(updates []DriverTelemetry) error {
	for _, update := range updates {
		if err := e.ProcessTelemetry(update); err != nil {
			return err
		}
	}
	return nil
}

// TelemetryProcessor handles high-throughput telemetry processing
type TelemetryProcessor struct {
	engine     *BroadcastEngine
	inputChan  chan DriverTelemetry
	batchSize  int
	flushInterval time.Duration
	done       chan struct{}
}

// NewTelemetryProcessor creates a processor for high-throughput scenarios
func NewTelemetryProcessor(engine *BroadcastEngine, batchSize int, flushInterval time.Duration) *TelemetryProcessor {
	return &TelemetryProcessor{
		engine:        engine,
		inputChan:     make(chan DriverTelemetry, 10000),
		batchSize:     batchSize,
		flushInterval: flushInterval,
		done:          make(chan struct{}),
	}
}

// Submit adds telemetry to the processing queue
func (p *TelemetryProcessor) Submit(telemetry DriverTelemetry) {
	select {
	case p.inputChan <- telemetry:
	default:
		// Queue full, process synchronously
		p.engine.ProcessTelemetry(telemetry)
	}
}

// Start begins processing telemetry
func (p *TelemetryProcessor) Start() {
	go p.processLoop()
}

// Stop stops the processor
func (p *TelemetryProcessor) Stop() {
	close(p.done)
}

func (p *TelemetryProcessor) processLoop() {
	ticker := time.NewTicker(p.flushInterval)
	defer ticker.Stop()

	batch := make([]DriverTelemetry, 0, p.batchSize)

	for {
		select {
		case telemetry := <-p.inputChan:
			batch = append(batch, telemetry)
			if len(batch) >= p.batchSize {
				p.engine.ProcessBatch(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				p.engine.ProcessBatch(batch)
				batch = batch[:0]
			}
		case <-p.done:
			// Process remaining
			if len(batch) > 0 {
				p.engine.ProcessBatch(batch)
			}
			return
		}
	}
}
