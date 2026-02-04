package proximity

import (
	"encoding/json"
	"sync"
)

// PubSub interface for distributed messaging
type PubSub interface {
	Publish(channel string, message []byte) error
	Subscribe(channel string, handler func([]byte)) error
	Unsubscribe(channel string) error
	Close() error
}

// PubSubMessage wraps messages for pub/sub transport
type PubSubMessage struct {
	Type    string          `json:"type"`
	RideID  string          `json:"rideId"`
	Payload json.RawMessage `json:"payload"`
}

// InMemoryPubSub implements PubSub for single-node or testing
type InMemoryPubSub struct {
	subscribers map[string][]func([]byte)
	mu          sync.RWMutex
}

// NewInMemoryPubSub creates a new in-memory pub/sub instance
func NewInMemoryPubSub() *InMemoryPubSub {
	return &InMemoryPubSub{
		subscribers: make(map[string][]func([]byte)),
	}
}

// Publish sends a message to all subscribers of a channel
func (p *InMemoryPubSub) Publish(channel string, message []byte) error {
	p.mu.RLock()
	handlers := p.subscribers[channel]
	p.mu.RUnlock()

	for _, handler := range handlers {
		// Call handlers synchronously to preserve ordering
		handler(message)
	}
	return nil
}

// Subscribe adds a handler for a channel
func (p *InMemoryPubSub) Subscribe(channel string, handler func([]byte)) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.subscribers[channel] = append(p.subscribers[channel], handler)
	return nil
}

// Unsubscribe removes all handlers for a channel
func (p *InMemoryPubSub) Unsubscribe(channel string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.subscribers, channel)
	return nil
}

// Close cleans up resources
func (p *InMemoryPubSub) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.subscribers = make(map[string][]func([]byte))
	return nil
}

// RedisPubSub implements PubSub using Redis (interface for production)
// This is a placeholder that would use a Redis client in production
type RedisPubSub struct {
	addr        string
	subscribers map[string][]func([]byte)
	mu          sync.RWMutex
}

// NewRedisPubSub creates a new Redis pub/sub instance
func NewRedisPubSub(addr string) *RedisPubSub {
	return &RedisPubSub{
		addr:        addr,
		subscribers: make(map[string][]func([]byte)),
	}
}

// Publish sends a message via Redis
func (r *RedisPubSub) Publish(channel string, message []byte) error {
	// In production, this would use redis.Publish
	// For now, use in-memory for testing
	r.mu.RLock()
	handlers := r.subscribers[channel]
	r.mu.RUnlock()

	for _, handler := range handlers {
		handler(message)
	}
	return nil
}

// Subscribe adds a handler for Redis channel
func (r *RedisPubSub) Subscribe(channel string, handler func([]byte)) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.subscribers[channel] = append(r.subscribers[channel], handler)
	return nil
}

// Unsubscribe removes handlers for a channel
func (r *RedisPubSub) Unsubscribe(channel string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.subscribers, channel)
	return nil
}

// Close closes Redis connections
func (r *RedisPubSub) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.subscribers = make(map[string][]func([]byte))
	return nil
}

// DistributedBroadcaster handles broadcasting across nodes
type DistributedBroadcaster struct {
	hub    *Hub
	pubsub PubSub
	nodeID string
}

// NewDistributedBroadcaster creates a broadcaster for multi-node setup
func NewDistributedBroadcaster(hub *Hub, pubsub PubSub, nodeID string) *DistributedBroadcaster {
	return &DistributedBroadcaster{
		hub:    hub,
		pubsub: pubsub,
		nodeID: nodeID,
	}
}

// BroadcastLocation publishes a location update to the pub/sub bus
func (d *DistributedBroadcaster) BroadcastLocation(rideID string, update CoordUpdate) error {
	payload, err := json.Marshal(update)
	if err != nil {
		return err
	}

	msg := PubSubMessage{
		Type:    TypeCoordUpdate,
		RideID:  rideID,
		Payload: payload,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return d.pubsub.Publish("ride:"+rideID, data)
}

// BroadcastNearby publishes a nearby notification to the pub/sub bus
func (d *DistributedBroadcaster) BroadcastNearby(rideID string, notification NearbyNotification) error {
	payload, err := json.Marshal(notification)
	if err != nil {
		return err
	}

	msg := PubSubMessage{
		Type:    TypeNearbyNotification,
		RideID:  rideID,
		Payload: payload,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return d.pubsub.Publish("ride:"+rideID, data)
}

// SubscribeToRide sets up subscription for receiving ride updates from other nodes
func (d *DistributedBroadcaster) SubscribeToRide(rideID string) error {
	return d.pubsub.Subscribe("ride:"+rideID, func(data []byte) {
		var msg PubSubMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			return
		}

		// Broadcast to local subscribers
		d.hub.BroadcastToRide(rideID, msg.Payload)
	})
}
