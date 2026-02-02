package proximity

import (
	"encoding/json"
	"sync"
	"time"
)

// MessageSender interface for sending messages (allows mocking)
type MessageSender interface {
	SendMessage(data []byte) error
	Close() error
}

// Client represents a connected WebSocket client
type Client struct {
	ID             string
	UserID         string
	RideID         string
	Sender         MessageSender
	Hub            *Hub
	LastActivity   time.Time
	IsSubscribed   bool
	NotifiedNearby bool
	LastSequence   int64
	closed         bool
	mu             sync.RWMutex
	sendChan       chan []byte
	done           chan struct{}
}

// NewClient creates a new client instance
func NewClient(id string, sender MessageSender, hub *Hub) *Client {
	return &Client{
		ID:           id,
		Sender:       sender,
		Hub:          hub,
		LastActivity: time.Now(),
		sendChan:     make(chan []byte, 256),
		done:         make(chan struct{}),
	}
}

// Send sends a message directly to the client
func (c *Client) Send(data []byte) error {
	c.mu.RLock()
	if c.closed {
		c.mu.RUnlock()
		return nil
	}
	sender := c.Sender
	c.mu.RUnlock()

	if sender != nil {
		return sender.SendMessage(data)
	}
	return nil
}

// SendJSON marshals and sends a JSON message
func (c *Client) SendJSON(v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return c.Send(data)
}

// UpdateActivity updates the last activity timestamp
func (c *Client) UpdateActivity() {
	c.mu.Lock()
	c.LastActivity = time.Now()
	c.mu.Unlock()
}

// IsIdle checks if the client has been idle beyond the timeout
func (c *Client) IsIdle() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return time.Since(c.LastActivity) > HeartbeatTimeout
}

// MarkNotifiedNearby marks that the NEARBY_NOTIFICATION has been sent
func (c *Client) MarkNotifiedNearby() {
	c.mu.Lock()
	c.NotifiedNearby = true
	c.mu.Unlock()
}

// HasNotifiedNearby checks if NEARBY_NOTIFICATION was already sent
func (c *Client) HasNotifiedNearby() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.NotifiedNearby
}

// UpdateSequence updates and returns the next sequence number
func (c *Client) UpdateSequence() int64 {
	c.mu.Lock()
	c.LastSequence++
	seq := c.LastSequence
	c.mu.Unlock()
	return seq
}

// GetSequence returns the current sequence number
func (c *Client) GetSequence() int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.LastSequence
}

// Subscribe sets the client's subscription
func (c *Client) Subscribe(rideID, userID string) {
	c.mu.Lock()
	c.RideID = rideID
	c.UserID = userID
	c.IsSubscribed = true
	c.NotifiedNearby = false
	c.LastSequence = 0
	c.mu.Unlock()
}

// Unsubscribe clears the client's subscription
func (c *Client) Unsubscribe() {
	c.mu.Lock()
	c.RideID = ""
	c.UserID = ""
	c.IsSubscribed = false
	c.NotifiedNearby = false
	c.mu.Unlock()
}

// Close closes the client connection
func (c *Client) Close() {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.closed = true
	close(c.done)
	c.mu.Unlock()

	if c.Sender != nil {
		c.Sender.Close()
	}
}

// IsClosed checks if the client is closed
func (c *Client) IsClosed() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.closed
}

// WritePump handles outgoing messages (run as goroutine)
func (c *Client) WritePump() {
	ticker := time.NewTicker(HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case message, ok := <-c.sendChan:
			if !ok {
				return
			}
			if c.Sender != nil {
				c.Sender.SendMessage(message)
			}
		case <-ticker.C:
			// Send heartbeat
			heartbeat := map[string]interface{}{
				"type":      TypeHeartbeat,
				"timestamp": time.Now().Unix(),
			}
			data, _ := json.Marshal(heartbeat)
			if c.Sender != nil {
				c.Sender.SendMessage(data)
			}
		case <-c.done:
			return
		}
	}
}
