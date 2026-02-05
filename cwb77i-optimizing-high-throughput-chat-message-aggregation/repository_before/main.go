package aggregator

import (
	"encoding/json"
	"sync"
	"time"
)

type Message struct {
	RoomID    string    `json:"room_id"`
	UserID    string    `json:"user_id"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

type Aggregator struct {
	mu       sync.Mutex
	buffers  map[string][]*Message // roomID -> messages
}

func NewAggregator() *Aggregator {
	return &Aggregator{
		buffers: make(map[string][]*Message),
	}
}

// AddMessage is called from multiple goroutines (one per WebSocket)
func (a *Aggregator) AddMessage(msg *Message) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if _, ok := a.buffers[msg.RoomID]; !ok {
		a.buffers[msg.RoomID] = make([]*Message, 0, 100)
	}
	a.buffers[msg.RoomID] = append(a.buffers[msg.RoomID], msg)
}

// Flush is called periodically by a single background goroutine
func (a *Aggregator) Flush() map[string][]*Message {
	a.mu.Lock()
	defer a.mu.Unlock()

	batches := make(map[string][]*Message)
	for roomID, msgs := range a.buffers {
		if len(msgs) > 0 {
			batches[roomID] = msgs
			a.buffers[roomID] = nil // reset buffer
		}
	}
	return batches
}

// Background flusher (simplified)
func (a *Aggregator) StartFlusher(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			batches := a.Flush()
			// Simulate DB write / broadcast
			for _, msgs := range batches {
				jsonData, _ := json.Marshal(msgs)
				// ... write to DB, broadcast ...
				_ = jsonData
			}
		}
	}()
}