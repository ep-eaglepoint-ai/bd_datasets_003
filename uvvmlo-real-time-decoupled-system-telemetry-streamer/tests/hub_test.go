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

	const numClients = 100
	var wg sync.WaitGroup
	var connectedCount int32
	connections := make([]*websocket.Conn, numClients)
	var connMu sync.Mutex

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
	}

	wg.Wait()
	time.Sleep(200 * time.Millisecond)

	if int(atomic.LoadInt32(&connectedCount)) != numClients {
		t.Errorf("Expected %d clients connected, got %d", numClients, connectedCount)
	}

	for i := 0; i < 10; i++ {
		h.Broadcast([]byte(`{"test": "data"}`))
		time.Sleep(10 * time.Millisecond)
	}

	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			connMu.Lock()
			conn := connections[idx]
			connMu.Unlock()
			if conn != nil {
				conn.Close()
			}
		}(i)
	}

	wg.Wait()
	time.Sleep(500 * time.Millisecond)

	clientCount := h.ClientCount()
	if clientCount != 0 {
		t.Errorf("Expected 0 clients after disconnect, got %d", clientCount)
	}
}

// TestSlowConsumerDoesNotBlockBroadcaster verifies slow clients don't block the broadcaster
func TestSlowConsumerDoesNotBlockBroadcaster(t *testing.T) {
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

	// Connect multiple fast clients
	const numFastClients = 3
	fastConns := make([]*websocket.Conn, numFastClients)
	for i := 0; i < numFastClients; i++ {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("Failed to connect fast client %d: %v", i, err)
		}
		fastConns[i] = conn
		defer conn.Close()
	}

	time.Sleep(100 * time.Millisecond)

	// Track received messages per fast client
	receivedCounts := make([]int32, numFastClients)
	var readersWg sync.WaitGroup

	// Start readers for fast clients - each reads exactly 5 messages then stops
	for i := 0; i < numFastClients; i++ {
		readersWg.Add(1)
		go func(idx int) {
			defer readersWg.Done()
			conn := fastConns[idx]
			for j := 0; j < 5; j++ {
				conn.SetReadDeadline(time.Now().Add(2 * time.Second))
				_, _, err := conn.ReadMessage()
				if err != nil {
					return
				}
				atomic.AddInt32(&receivedCounts[idx], 1)
			}
		}(i)
	}

	// Broadcast messages - should NOT block due to slow consumer
	start := time.Now()
	for i := 0; i < 20; i++ {
		h.Broadcast([]byte(`{"test": "message"}`))
		time.Sleep(10 * time.Millisecond)
	}
	broadcastDuration := time.Since(start)

	// Wait for readers
	readersWg.Wait()

	// Verify broadcast completed in reasonable time (not blocked by slow consumer)
	if broadcastDuration > 2*time.Second {
		t.Errorf("Broadcast took too long: %v (slow consumer blocking)", broadcastDuration)
	}

	// Verify fast clients received messages
	totalReceived := int32(0)
	for i, count := range receivedCounts {
		totalReceived += count
		t.Logf("Fast client %d received: %d messages", i, count)
	}

	if totalReceived == 0 {
		t.Error("No fast clients received any messages")
	}

	t.Logf("Broadcast duration: %v, Total messages received by fast clients: %d", broadcastDuration, totalReceived)
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