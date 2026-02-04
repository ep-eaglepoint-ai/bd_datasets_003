package tests

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"telemetry-streamer/pkg/hub"
	"telemetry-streamer/pkg/metrics"
)

func TestFullIntegration(t *testing.T) {
	h := hub.NewHub()
	go h.Run()
	defer h.Stop()

	collector := metrics.NewCollector(100 * time.Millisecond)
	go collector.Start(h.Broadcast)
	defer collector.Stop()

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

	// Connect client
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	// Wait for metrics
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read message: %v", err)
	}

	var m metrics.SystemMetrics
	if err := json.Unmarshal(msg, &m); err != nil {
		t.Fatalf("Failed to unmarshal metrics: %v", err)
	}

	if m.Timestamp == 0 {
		t.Error("Invalid timestamp")
	}

	t.Logf("Received valid metrics: CPU=%.2f%%, Memory=%.2f%%, Goroutines=%d",
		m.CPUUsage, m.MemoryUsagePercent, m.NumGoroutines)
}

func TestMultipleClientsReceiveMetrics(t *testing.T) {
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

	const numClients = 5
	var wg sync.WaitGroup
	receivedCounts := make([]int, numClients)
	connections := make([]*websocket.Conn, numClients)

	// Connect all clients
	for i := 0; i < numClients; i++ {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatalf("Failed to connect client %d: %v", i, err)
		}
		connections[i] = conn
	}

	// Start reading
	for i := 0; i < numClients; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			conn := connections[idx]
			for j := 0; j < 3; j++ {
				conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
				_, _, err := conn.ReadMessage()
				if err == nil {
					receivedCounts[idx]++
				}
			}
		}(i)
	}

	// Broadcast messages
	for i := 0; i < 5; i++ {
		h.Broadcast([]byte(`{"test": "broadcast"}`))
		time.Sleep(50 * time.Millisecond)
	}

	wg.Wait()

	// Cleanup
	for _, conn := range connections {
		conn.Close()
	}

	// Verify all clients received messages
	for i, count := range receivedCounts {
		if count == 0 {
			t.Errorf("Client %d received no messages", i)
		}
	}
}