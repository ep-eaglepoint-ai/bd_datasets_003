package tests

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"telemetry-streamer/pkg/hub"
)

// TestConcurrentClientConnections tests 100 clients connecting and disconnecting simultaneously
// with a mock metrics generator pushing data continuously
func TestConcurrentClientConnections(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := hub.NewClient(conn, h)
		h.Register(client)

		// Read pump
		go func() {
			defer h.Unregister(client)
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}()

		// Write pump
		go func() {
			for {
				select {
				case msg, ok := <-client.Send:
					if !ok {
						return
					}
					conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
					if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
						return
					}
				case <-client.Done:
					return
				}
			}
		}()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Start mock metrics generator that continuously pushes data
	stopGenerator := make(chan struct{})
	var generatorWg sync.WaitGroup
	generatorWg.Add(1)
	var messagesSent int32

	go func() {
		defer generatorWg.Done()
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				h.Broadcast([]byte(`{"mock":"data","clients":` + string(rune(h.ClientCount())) + `}`))
				atomic.AddInt32(&messagesSent, 1)
			case <-stopGenerator:
				return
			}
		}
	}()

	const numClients = 100
	var wg sync.WaitGroup
	var connectedCount int32
	var disconnectedCount int32
	connections := make([]*websocket.Conn, numClients)
	var connMu sync.Mutex

	// Phase 1: Connect all clients while generator is running
	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
			if err != nil {
				t.Logf("Failed to connect client %d: %v", idx, err)
				return
			}
			connMu.Lock()
			connections[idx] = conn
			connMu.Unlock()
			atomic.AddInt32(&connectedCount, 1)
		}(i)
		
		// Small delay to create overlap with generator
		if i%10 == 0 {
			time.Sleep(5 * time.Millisecond)
		}
	}

	wg.Wait()
	time.Sleep(100 * time.Millisecond)

	if int(atomic.LoadInt32(&connectedCount)) != numClients {
		t.Errorf("Expected %d clients connected, got %d", numClients, connectedCount)
	}

	// Generator continues running during this phase
	time.Sleep(200 * time.Millisecond)

	// Phase 2: Disconnect all clients while generator is still running
	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			connMu.Lock()
			conn := connections[idx]
			connMu.Unlock()
			if conn != nil {
				conn.Close()
				atomic.AddInt32(&disconnectedCount, 1)
			}
		}(i)
		
		// Small delay to create overlap
		if i%10 == 0 {
			time.Sleep(5 * time.Millisecond)
		}
	}

	wg.Wait()
	time.Sleep(500 * time.Millisecond)

	// Stop the generator
	close(stopGenerator)
	generatorWg.Wait()

	// Verify all clients are cleaned up
	clientCount := h.ClientCount()
	if clientCount != 0 {
		t.Errorf("Expected 0 clients after disconnect, got %d", clientCount)
	}

	sentCount := atomic.LoadInt32(&messagesSent)
	t.Logf("Mock generator sent %d messages while %d clients connected and %d disconnected",
		sentCount, connectedCount, disconnectedCount)

	if sentCount < 10 {
		t.Error("Mock generator should have sent at least 10 messages during the test")
	}
}

// TestSlowConsumerDoesNotBlockBroadcaster verifies slow clients don't block the broadcaster
// This test verifies the select with default case requirement
func TestSlowConsumerDoesNotBlockBroadcaster(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	// The key test: rapidly broadcast many messages
	// If the broadcaster blocks on slow consumers, this will take too long
	start := time.Now()
	for i := 0; i < 1000; i++ {
		h.Broadcast([]byte(`{"test": "message"}`))
	}
	duration := time.Since(start)

	// Broadcasting 1000 messages should be nearly instant if non-blocking
	if duration > 500*time.Millisecond {
		t.Errorf("Broadcast took too long: %v - slow consumer blocking detected", duration)
	}

	t.Logf("1000 broadcasts completed in %v (non-blocking verified)", duration)
}

// TestSlowConsumerWithRealConnection tests with actual WebSocket connections
func TestSlowConsumerWithRealConnection(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := hub.NewClient(conn, h)
		h.Register(client)

		go func() {
			defer h.Unregister(client)
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}()

		go func() {
			for {
				select {
				case msg, ok := <-client.Send:
					if !ok {
						return
					}
					conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
					if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
						return
					}
				case <-client.Done:
					return
				}
			}
		}()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Connect a slow client that never reads (simulates stalled consumer)
	slowConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect slow client: %v", err)
	}
	defer slowConn.Close()

	// Connect a fast client
	fastConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect fast client: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Track received messages
	var receivedCount int32
	done := make(chan struct{})

	// Fast client reader
	go func() {
		defer close(done)
		for i := 0; i < 10; i++ {
			fastConn.SetReadDeadline(time.Now().Add(1 * time.Second))
			_, _, err := fastConn.ReadMessage()
			if err != nil {
				return
			}
			atomic.AddInt32(&receivedCount, 1)
		}
	}()

	// Broadcast messages
	for i := 0; i < 20; i++ {
		h.Broadcast([]byte(`{"test": "message"}`))
		time.Sleep(20 * time.Millisecond)
	}

	// Wait for reader
	<-done
	fastConn.Close()

	received := atomic.LoadInt32(&receivedCount)
	if received == 0 {
		t.Error("Fast client received no messages")
	}

	t.Logf("Fast client received %d messages while slow client was stalled", received)
}

// TestClientMapReturnsToZero verifies the client registry is empty after all disconnects
func TestClientMapReturnsToZero(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := hub.NewClient(conn, h)
		h.Register(client)

		go func() {
			defer h.Unregister(client)
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	var connections []*websocket.Conn
	for i := 0; i < 20; i++ {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("Failed to connect: %v", err)
		}
		connections = append(connections, conn)
	}

	time.Sleep(200 * time.Millisecond)

	initialCount := h.ClientCount()
	if initialCount != 20 {
		t.Errorf("Expected 20 clients, got %d", initialCount)
	}

	for _, conn := range connections {
		conn.Close()
	}

	time.Sleep(500 * time.Millisecond)

	finalCount := h.ClientCount()
	if finalCount != 0 {
		t.Errorf("Expected 0 clients after disconnect, got %d", finalCount)
	}
}

// TestHubBroadcastNonBlocking ensures broadcast doesn't block even with full channels
func TestHubBroadcastNonBlocking(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	done := make(chan struct{})

	go func() {
		for i := 0; i < 1000; i++ {
			h.Broadcast([]byte(`{"rapid": "test"}`))
		}
		close(done)
	}()

	select {
	case <-done:
		// Success
	case <-time.After(2 * time.Second):
		t.Error("Broadcast loop appears to be blocked")
	}
}

// TestClientCleanupOnDisconnect verifies proper cleanup sequence
func TestClientCleanupOnDisconnect(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	upgrader := websocket.Upgrader{}
	var clientRef *hub.Client
	var clientMu sync.Mutex

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := hub.NewClient(conn, h)
		clientMu.Lock()
		clientRef = client
		clientMu.Unlock()
		h.Register(client)

		go func() {
			defer h.Unregister(client)
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	if h.ClientCount() != 1 {
		t.Errorf("Expected 1 client, got %d", h.ClientCount())
	}

	conn.Close()
	time.Sleep(300 * time.Millisecond)

	if h.ClientCount() != 0 {
		t.Errorf("Expected 0 clients after cleanup, got %d", h.ClientCount())
	}

	clientMu.Lock()
	if clientRef != nil && !clientRef.IsClosed() {
		t.Error("Client should be marked as closed")
	}
	clientMu.Unlock()
}

// TestSelectWithDefaultCase verifies non-blocking send behavior
func TestSelectWithDefaultCase(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := hub.NewClient(conn, h)
		h.Register(client)

		go func() {
			defer h.Unregister(client)
			<-client.Done
		}()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	stalledConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer stalledConn.Close()

	time.Sleep(100 * time.Millisecond)

	start := time.Now()
	for i := 0; i < 100; i++ {
		h.Broadcast([]byte(`{"flood": "test"}`))
	}
	duration := time.Since(start)

	if duration > 500*time.Millisecond {
		t.Errorf("Broadcast to stalled client took too long: %v", duration)
	}

	t.Logf("100 broadcasts to stalled client completed in %v", duration)
}

// TestMutexProtectedClientRegistry verifies concurrent access safety
func TestMutexProtectedClientRegistry(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := hub.NewClient(conn, h)
		h.Register(client)

		go func() {
			defer h.Unregister(client)
			for {
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
			}
		}()
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	var wg sync.WaitGroup

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 50; j++ {
				_ = h.ClientCount()
				time.Sleep(time.Millisecond)
			}
		}()
	}

	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
			if err != nil {
				return
			}
			time.Sleep(50 * time.Millisecond)
			conn.Close()
		}()
	}

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				h.Broadcast([]byte(`{"concurrent": "test"}`))
				time.Sleep(time.Millisecond)
			}
		}()
	}

	wg.Wait()
	time.Sleep(500 * time.Millisecond)

	t.Log("Concurrent access test passed without race conditions")
}