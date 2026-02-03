package aggregator

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

// TestAggregator_Concurrency verifies that thousands of messages can be added
// from concurrent goroutines without data races or corruption.
func TestAggregator_Concurrency(t *testing.T) {
	agg := NewAggregator()
	numGoroutines := 100
	msgsPerGoroutine := 500
	numRooms := 50

	var wg sync.WaitGroup
	wg.Add(numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func(gID int) {
			defer wg.Done()
			for j := 0; j < msgsPerGoroutine; j++ {
				roomID := fmt.Sprintf("room-%d", j%numRooms)
				agg.AddMessage(&Message{
					RoomID:    roomID,
					UserID:    fmt.Sprintf("user-%d", gID),
					Content:   "test message",
					Timestamp: time.Now(),
				})
			}
		}(i)
	}

	wg.Wait()

	batches := agg.Flush()
	totalMsgs := 0
	for _, batch := range batches {
		totalMsgs += len(batch)
	}

	expectedTotal := numGoroutines * msgsPerGoroutine
	if totalMsgs != expectedTotal {
		t.Errorf("Expected total messages %d, got %d", expectedTotal, totalMsgs)
	}
}

// TestAggregator_MemoryBounding verifies that the aggregator successfully
// bounds memory per room even when messages flow in faster than they are flushed.
func TestAggregator_MemoryBounding(t *testing.T) {
	const maxMessagesPerRoom = 1000 // Test against the expected architectural limit
	agg := NewAggregator()
	roomID := "overflow-room"

	// Push more messages than the limit
	totalPush := 1500
	for i := 0; i < totalPush; i++ {
		agg.AddMessage(&Message{
			RoomID:  roomID,
			Content: fmt.Sprintf("msg-%d", i),
		})
	}

	batches := agg.Flush()
	msgs := batches[roomID]

	// Requirement: Memory usage must be bounded
	if len(msgs) > maxMessagesPerRoom {
		t.Errorf("Buffer overflow! Expected max %d messages, got %d", maxMessagesPerRoom, len(msgs))
	}

	// Requirement: Must contain the LATEST messages (sliding window)
	if len(msgs) > 0 {
		lastMsg := msgs[len(msgs)-1]
		expectedLastContent := fmt.Sprintf("msg-%d", totalPush-1)
		if lastMsg.Content != expectedLastContent {
			t.Errorf("Sliding window failed. Expected last message %s, got %s", expectedLastContent, lastMsg.Content)
		}
	}
}

// TestAggregator_Order verifies that message order is strictly preserved within each room.
func TestAggregator_Order(t *testing.T) {
	agg := NewAggregator()
	roomID := "ordered-room"
	numMsgs := 500

	for i := 0; i < numMsgs; i++ {
		agg.AddMessage(&Message{
			RoomID:  roomID,
			Content: fmt.Sprintf("%d", i),
		})
	}

	batches := agg.Flush()
	msgs := batches[roomID]

	for i, msg := range msgs {
		if msg.Content != fmt.Sprintf("%d", i) {
			t.Fatalf("Order corruption at index %d: expected %d, got %s", i, i, msg.Content)
		}
	}
}

// TestAggregator_RaceConcurrentFlush verifies safety during simultaneous Add and Flush.
func TestAggregator_RaceConcurrentFlush(t *testing.T) {
	agg := NewAggregator()
	stop := make(chan struct{})

	// Intense producer
	go func() {
		for {
			select {
			case <-stop:
				return
			default:
				agg.AddMessage(&Message{
					RoomID:  fmt.Sprintf("room-%d", time.Now().UnixNano()%10),
					Content: "noise",
				})
			}
		}
	}()

	// Intense flusher
	timeout := time.After(200 * time.Millisecond)
	for {
		select {
		case <-timeout:
			close(stop)
			return
		default:
			agg.Flush()
			time.Sleep(1 * time.Microsecond)
		}
	}
}

// TestAggregator_EmptyFlush verifies that Flush returns an empty map when no messages exist.
func TestAggregator_EmptyFlush(t *testing.T) {
	agg := NewAggregator()
	batches := agg.Flush()
	if len(batches) != 0 {
		t.Errorf("Expected empty batches, got %d", len(batches))
	}
}

// TestAggregator_NilMessage verifies that the aggregator handles nil messages gracefully.
func TestAggregator_NilMessage(t *testing.T) {
	agg := NewAggregator()
	// Should not panic
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("Aggregator panicked on nil message: %v", r)
		}
	}()

	agg.AddMessage(nil)
	batches := agg.Flush()
	if len(batches) != 0 {
		t.Errorf("Expected empty batches after adding nil message, got %d", len(batches))
	}
}

// TestAggregator_ShardAtomicity verifies that messages are either in the
// current batch or the next, and never silently lost during high-frequency flushes.
func TestAggregator_ShardAtomicity(t *testing.T) {
	agg := NewAggregator()
	numMessages := 5000
	roomID := "atomicity-room"

	totalCounted := 0
	var mu sync.Mutex

	producerDone := make(chan bool)
	flusherDone := make(chan bool)

	// Message producer
	go func() {
		for i := 0; i < numMessages; i++ {
			agg.AddMessage(&Message{
				RoomID:  roomID,
				Content: fmt.Sprintf("%d", i),
			})
			if i%100 == 0 {
				time.Sleep(10 * time.Microsecond)
			}
		}
		producerDone <- true
	}()

	// Constant flusher
	go func() {
		for {
			select {
			case <-producerDone:
				// Final flush to catch remaining messages
				fb := agg.Flush()
				mu.Lock()
				totalCounted += len(fb[roomID])
				mu.Unlock()
				flusherDone <- true
				return
			default:
				fb := agg.Flush()
				if len(fb[roomID]) > 0 {
					mu.Lock()
					totalCounted += len(fb[roomID])
					mu.Unlock()
				}
				time.Sleep(50 * time.Microsecond)
			}
		}
	}()

	select {
	case <-flusherDone:
		// Success
	case <-time.After(5 * time.Second):
		t.Fatal("Test timed out - possible deadlock or extreme slowness")
	}

	if totalCounted != numMessages {
		t.Errorf("Message loss detected! Expected %d, got %d", numMessages, totalCounted)
	}
}
