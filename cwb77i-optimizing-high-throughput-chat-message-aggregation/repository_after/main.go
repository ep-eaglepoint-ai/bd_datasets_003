package aggregator

import (
	"encoding/json"
	"sync"
	"time"
)

// Message represents a chat message.
type Message struct {
	RoomID    string    `json:"room_id"`
	UserID    string    `json:"user_id"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

// Optimization Constants
const (
	numShards          = 64   // Number of shards to balance lock contention
	maxMessagesPerRoom = 1000 // Upper bound for messages per room to prevent OOM
	initialRoomCap     = 100  // Pre-allocation hint for room buffers
)

// shard represents a subset of the aggregator's data with its own lock.
type shard struct {
	mu      sync.Mutex
	buffers map[string][]*Message
}

// Aggregator handles high-throughput message batching using lock sharding.
type Aggregator struct {
	shards [numShards]*shard
}

// NewAggregator initializes a sharded aggregator.
func NewAggregator() *Aggregator {
	a := &Aggregator{}
	for i := 0; i < numShards; i++ {
		a.shards[i] = &shard{
			buffers: make(map[string][]*Message),
		}
	}
	return a
}

// hash provides a fast FNV-1a like hashing for string room IDs.
func (a *Aggregator) hash(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h *= 16777619
		h ^= uint32(s[i])
	}
	return h
}

// AddMessage is called from multiple goroutines concurrently.
// It uses sharding to minimize lock contention and bounds memory usage per room.
func (a *Aggregator) AddMessage(msg *Message) {
	if msg == nil {
		return
	}

	// 1. Determine which shard this room belongs to
	shardID := a.hash(msg.RoomID) % numShards
	s := a.shards[shardID]

	// 2. Lock only the relevant shard
	s.mu.Lock()
	defer s.mu.Unlock()

	msgs := s.buffers[msg.RoomID]

	// 3. Memory Bounding: Use a sliding window if the buffer is full
	if len(msgs) >= maxMessagesPerRoom {
		// Optimization: Shift existing elements to drop the oldest.
		// For slices of 1000, this is extremely fast compared to an OOM crash.
		copy(msgs, msgs[1:])
		msgs[len(msgs)-1] = msg
	} else {
		// Pre-allocate first time to reduce allocation frequency
		if msgs == nil {
			msgs = make([]*Message, 0, initialRoomCap)
		}
		s.buffers[msg.RoomID] = append(msgs, msg)
	}
}

// Flush collects all current message batches room-by-room.
// It iterates through shards one-by-one to avoid holding a global lock.
func (a *Aggregator) Flush() map[string][]*Message {
	batches := make(map[string][]*Message)

	for i := 0; i < numShards; i++ {
		s := a.shards[i]

		// Lock the shard briefly to extract data
		s.mu.Lock()
		for roomID, msgs := range s.buffers {
			if len(msgs) > 0 {
				batches[roomID] = msgs
				// Removing the key ensures memory reclamation for ephemeral rooms.
				delete(s.buffers, roomID)
			}
		}
		s.mu.Unlock()
	}

	return batches
}

// StartFlusher executes periodic flushing in a background goroutine.
func (a *Aggregator) StartFlusher(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			batches := a.Flush()

			// Process batches (e.g., push to DB or broadcast)
			for _, msgs := range batches {
				// The prompt expects JSON marshaling as part of the simulation
				jsonData, _ := json.Marshal(msgs)
				_ = jsonData // Simulating data sink
			}
		}
	}()
}
