package proximity

import (
	"encoding/json"
	"sync"
	"time"
)

// RideStore interface for ride data access
type RideStore interface {
	GetRide(rideID string) (*Ride, error)
	IsRideCompleted(rideID string) bool
}

// Hub manages all WebSocket connections and subscriptions
type Hub struct {
	// Maps rideID -> map of clientID -> Client
	subscriptions map[string]map[string]*Client

	// All connected clients by ID
	clients map[string]*Client

	// PubSub for distributed messaging
	pubsub PubSub

	// Ride data store
	rideStore RideStore

	// Sequence counters per ride for message ordering
	rideSequences map[string]int64

	mu sync.RWMutex

	// Channels for hub operations
	register   chan *Client
	unregister chan *Client
	broadcast  chan *BroadcastMessage

	// Cleanup ticker
	cleanupDone chan struct{}
}

// BroadcastMessage represents a message to broadcast to a ride
type BroadcastMessage struct {
	RideID  string
	Message []byte
}

// NewHub creates a new Hub instance
func NewHub(pubsub PubSub, rideStore RideStore) *Hub {
	h := &Hub{
		subscriptions: make(map[string]map[string]*Client),
		clients:       make(map[string]*Client),
		pubsub:        pubsub,
		rideStore:     rideStore,
		rideSequences: make(map[string]int64),
		register:      make(chan *Client, 256),
		unregister:    make(chan *Client, 256),
		broadcast:     make(chan *BroadcastMessage, 1024),
		cleanupDone:   make(chan struct{}),
	}
	return h
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	go h.cleanupLoop()

	for {
		select {
		case client := <-h.register:
			h.handleRegister(client)
		case client := <-h.unregister:
			h.handleUnregister(client)
		case msg := <-h.broadcast:
			h.handleBroadcast(msg)
		}
	}
}

// RegisterClient adds a client to the hub
func (h *Hub) RegisterClient(client *Client) {
	h.register <- client
}

// UnregisterClient removes a client from the hub
func (h *Hub) UnregisterClient(client *Client) {
	h.unregister <- client
}

// handleRegister processes client registration
func (h *Hub) handleRegister(client *Client) {
	h.mu.Lock()
	h.clients[client.ID] = client
	h.mu.Unlock()
}

// handleUnregister processes client unregistration
func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client.ID]; ok {
		delete(h.clients, client.ID)

		// Remove from ride subscriptions
		if client.RideID != "" {
			if subs, ok := h.subscriptions[client.RideID]; ok {
				delete(subs, client.ID)
				if len(subs) == 0 {
					delete(h.subscriptions, client.RideID)
				}
			}
		}

		client.Close()
	}
}

// SubscribeToRide subscribes a client to a specific ride
func (h *Hub) SubscribeToRide(client *Client, rideID, userID string) error {
	// Validate ride exists and belongs to user
	if h.rideStore != nil {
		ride, err := h.rideStore.GetRide(rideID)
		if err != nil {
			return err
		}
		if ride == nil {
			return &ValidationError{Message: "ride not found", Code: "RIDE_NOT_FOUND"}
		}
		if ride.PassengerID != userID {
			return &ValidationError{Message: "unauthorized access to ride", Code: "UNAUTHORIZED"}
		}
		if ride.Status == "completed" {
			return &ValidationError{Message: "ride already completed", Code: "RIDE_COMPLETED"}
		}
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	// Remove from previous subscription if any
	if client.RideID != "" && client.RideID != rideID {
		if subs, ok := h.subscriptions[client.RideID]; ok {
			delete(subs, client.ID)
		}
	}

	// Add to new subscription
	if _, ok := h.subscriptions[rideID]; !ok {
		h.subscriptions[rideID] = make(map[string]*Client)
	}
	h.subscriptions[rideID][client.ID] = client

	// Update client state
	client.Subscribe(rideID, userID)

	return nil
}

// UnsubscribeFromRide removes a client from ride updates
func (h *Hub) UnsubscribeFromRide(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if client.RideID != "" {
		if subs, ok := h.subscriptions[client.RideID]; ok {
			delete(subs, client.ID)
			if len(subs) == 0 {
				delete(h.subscriptions, client.RideID)
			}
		}
	}

	client.Unsubscribe()
}

// BroadcastToRide sends a message to all subscribers of a ride
func (h *Hub) BroadcastToRide(rideID string, message []byte) {
	h.broadcast <- &BroadcastMessage{
		RideID:  rideID,
		Message: message,
	}
}

// handleBroadcast processes broadcast messages
func (h *Hub) handleBroadcast(msg *BroadcastMessage) {
	h.mu.RLock()
	subscribers := h.subscriptions[msg.RideID]
	h.mu.RUnlock()

	for _, client := range subscribers {
		client.Send(msg.Message)
	}
}

// GetNextSequence returns the next sequence number for a ride
func (h *Hub) GetNextSequence(rideID string) int64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.rideSequences[rideID]++
	return h.rideSequences[rideID]
}

// GetSubscribers returns all clients subscribed to a ride
func (h *Hub) GetSubscribers(rideID string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	subs, ok := h.subscriptions[rideID]
	if !ok {
		return nil
	}

	clients := make([]*Client, 0, len(subs))
	for _, client := range subs {
		clients = append(clients, client)
	}
	return clients
}

// DisconnectRideSubscribers disconnects all subscribers of a completed ride
func (h *Hub) DisconnectRideSubscribers(rideID string) {
	h.mu.Lock()
	subscribers := h.subscriptions[rideID]
	delete(h.subscriptions, rideID)
	delete(h.rideSequences, rideID)
	h.mu.Unlock()

	// Send completion message and disconnect
	completedMsg := RideCompletedEvent{
		Type:   TypeRideCompleted,
		RideID: rideID,
	}
	msgData, _ := json.Marshal(completedMsg)

	for _, client := range subscribers {
		client.Send(msgData)
		h.UnregisterClient(client)
	}
}

// cleanupLoop periodically cleans up idle connections
func (h *Hub) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			h.cleanupIdleClients()
		case <-h.cleanupDone:
			return
		}
	}
}

// cleanupIdleClients removes clients that have been idle too long
func (h *Hub) cleanupIdleClients() {
	h.mu.RLock()
	var idleClients []*Client
	for _, client := range h.clients {
		if client.IsIdle() {
			idleClients = append(idleClients, client)
		}
	}
	h.mu.RUnlock()

	for _, client := range idleClients {
		h.UnregisterClient(client)
	}
}

// GetClientCount returns the total number of connected clients
func (h *Hub) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// GetSubscriberCount returns the number of subscribers for a ride
func (h *Hub) GetSubscriberCount(rideID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if subs, ok := h.subscriptions[rideID]; ok {
		return len(subs)
	}
	return 0
}

// ValidationError represents a validation error
type ValidationError struct {
	Message string
	Code    string
}

func (e *ValidationError) Error() string {
	return e.Message
}
