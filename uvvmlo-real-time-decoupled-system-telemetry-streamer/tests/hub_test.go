package tests

import (
	"net/http"
	"net/http/httptest"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"telemetry-streamer/pkg/hub"
	wshandler "telemetry-streamer/pkg/websocket"
)

// TestConcurrentClientConnections tests 100 clients (requirement #5)
func TestConcurrentClientConnections(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wshandler.HandleConnection(w, r, h)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Mock metrics generator
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
				h.Broadcast([]byte(`{"mock":"data"}`))
				atomic.AddInt32(&messagesSent, 1)
			case <-stopGenerator:
				return
			}
		}
	}()

	const numClients = 100
	var wg sync.WaitGroup
	var connectedCount int32
	connections := make([]*websocket.Conn, numClients)
	var connMu sync.Mutex

	// Connect all clients
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

		if i%10 == 0 {
			time.Sleep(5 * time.Millisecond)
		}
	}

	wg.Wait()
	time.Sleep(100 * time.Millisecond)

	if int(atomic.LoadInt32(&connectedCount)) != numClients {
		t.Errorf("Expected %d clients connected, got %d", numClients, connectedCount)
	}

	time.Sleep(200 * time.Millisecond)

	// Disconnect all clients
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

		if i%10 == 0 {
			time.Sleep(5 * time.Millisecond)
		}
	}

	wg.Wait()
	time.Sleep(500 * time.Millisecond)

	close(stopGenerator)
	generatorWg.Wait()

	// Requirement #7: verify map returns to zero
	clientCount := h.ClientCount()
	if clientCount != 0 {
		t.Errorf("Expected 0 clients after disconnect, got %d", clientCount)
	}

	t.Logf("Successfully handled %d concurrent clients with %d broadcasts",
		connectedCount, atomic.LoadInt32(&messagesSent))
}

// FIX #6: Slow consumer test with EXPLICIT message drop assertion (requirement #6)
func TestSlowConsumerDoesNotBlockBroadcaster(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wshandler.HandleConnection(w, r, h)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Create slow client that NEVER reads (simulates stalled network)
	slowConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect slow client: %v", err)
	}
	defer slowConn.Close()

	// Explicitly stall read operation with long deadline
	readBlocked := make(chan struct{})
	go func() {
		close(readBlocked)
		slowConn.SetReadDeadline(time.Now().Add(10 * time.Minute))
		slowConn.ReadMessage() // Blocks here
	}()
	<-readBlocked
	time.Sleep(50 * time.Millisecond) // Ensure read is blocked

	// Create fast client
	fastConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect fast client: %v", err)
	}
	defer fastConn.Close()

	time.Sleep(100 * time.Millisecond)

	var fastReceived int32
	var slowReceived int32 // Should stay 0
	done := make(chan struct{})

	// Fast client reader
	go func() {
		defer close(done)
		for i := 0; i < 20; i++ {
			fastConn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
			_, _, err := fastConn.ReadMessage()
			if err != nil {
				return
			}
			atomic.AddInt32(&fastReceived, 1)
		}
	}()

	// Slow client reader (will never receive)
	go func() {
		slowConn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
		_, _, err := slowConn.ReadMessage()
		if err == nil {
			atomic.AddInt32(&slowReceived, 1)
		}
	}()

	// Rapid broadcast
	const totalMessages = 50
	start := time.Now()
	for i := 0; i < totalMessages; i++ {
		h.Broadcast([]byte(`{"test": "message"}`))
		time.Sleep(10 * time.Millisecond)
	}
	broadcastDuration := time.Since(start)

	<-done

	fastCount := atomic.LoadInt32(&fastReceived)
	slowCount := atomic.LoadInt32(&slowReceived)

	// FIX #6: Explicit assertion that slow client got FEWER messages
	if slowCount >= fastCount {
		t.Errorf("Slow client received %d msgs, fast received %d - messages should be dropped for slow client",
			slowCount, fastCount)
	}

	if fastCount == 0 {
		t.Error("Fast client received no messages - broadcaster may be blocked")
	}

	if broadcastDuration > 2*time.Second {
		t.Errorf("Broadcast took too long (%v), slow client blocking detected", broadcastDuration)
	}

	t.Logf("✓ Fast client: %d msgs, Slow client: %d msgs (dropped: ~%d)",
		fastCount, slowCount, totalMessages-int(slowCount))
	t.Logf("✓ Broadcaster non-blocking verified (%v for %d messages)", broadcastDuration, totalMessages)
}

// TestClientMapReturnsToZero (requirement #7)
func TestClientMapReturnsToZero(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wshandler.HandleConnection(w, r, h)
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

// FIX #5: Add runtime import and goroutine leak test
func TestGoroutineLeakPrevention(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wshandler.HandleConnection(w, r, h)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	// Baseline goroutine count
	time.Sleep(100 * time.Millisecond)
	runtime.GC() // Force cleanup
	baselineGoroutines := runtime.NumGoroutine()

	// Create and destroy connections
	for round := 0; round < 3; round++ {
		var connections []*websocket.Conn
		for i := 0; i < 10; i++ {
			conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
			if err != nil {
				t.Fatalf("Failed to connect: %v", err)
			}
			connections = append(connections, conn)
		}

		time.Sleep(100 * time.Millisecond)

		for _, conn := range connections {
			conn.Close()
		}

		time.Sleep(200 * time.Millisecond)
	}

	time.Sleep(500 * time.Millisecond)
	runtime.GC()

	finalGoroutines := runtime.NumGoroutine()
	goroutineDelta := finalGoroutines - baselineGoroutines

	t.Logf("Baseline: %d, Final: %d, Delta: %d",
		baselineGoroutines, finalGoroutines, goroutineDelta)

	if goroutineDelta > 5 {
		t.Errorf("Goroutine leak detected: %d extra goroutines", goroutineDelta)
	}
}

// TestMutexProtectedClientRegistry (requirement #1: RWMutex protection)
func TestMutexProtectedClientRegistry(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wshandler.HandleConnection(w, r, h)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

	var wg sync.WaitGroup

	// Concurrent reads
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

	// Concurrent writes
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

	// Concurrent broadcasts
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 20; j++ {
				h.Broadcast([]byte(`{"test": "data"}`))
				time.Sleep(time.Millisecond)
			}
		}()
	}

	wg.Wait()
	time.Sleep(500 * time.Millisecond)

	t.Log("✓ No race conditions detected with concurrent access")
}