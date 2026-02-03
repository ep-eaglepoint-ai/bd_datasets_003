package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Helper to try and trigger shutdown on the hub via reflection
// to keep the test code identical even if Hub struct differs.
func tryShutdownHub(h interface{}) bool {
	v := reflect.ValueOf(h)
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	// Look for exported Quit channel
	f := v.FieldByName("Quit")
	if f.IsValid() && f.Kind() == reflect.Chan {
		// Use interface conversion to close the channel safely
		if ch, ok := f.Interface().(chan struct{}); ok {
			close(ch)
			return true
		}
	}
	return false
}

func TestGoroutineLeak(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=leak&user=user"

	baseline := runtime.NumGoroutine()

	numClients := 100
	var wg sync.WaitGroup
	wg.Add(numClients)

	for i := 0; i < numClients; i++ {
		go func(id int) {
			defer wg.Done()
			url := fmt.Sprintf("%s%d", wsURL, id)
			conn, _, err := websocket.DefaultDialer.Dial(url, nil)
			if err != nil {
				return
			}
			time.Sleep(100 * time.Millisecond)
			conn.Close()
		}(i)
	}

	wg.Wait()
	time.Sleep(2 * time.Second) // Wait for cleanup

	current := runtime.NumGoroutine()
	if current > baseline+15 { // Slightly more lenient to avoid flaky false positives
		t.Errorf("Potential goroutine leak detected: baseline %d, current %d. Leaked at least %d goroutines.", baseline, current, current-baseline)
	}
}

func TestDataRace(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" {
			hub.ServeMetrics(w, r)
		} else {
			ServeWs(hub, w, r)
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=race&user=user"

	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				return
			default:
				resp, err := http.Get(server.URL + "/metrics")
				if err == nil {
					resp.Body.Close()
				}
				time.Sleep(1 * time.Millisecond)
			}
		}
	}()

	numClients := 10
	var wg sync.WaitGroup
	wg.Add(numClients)
	for i := 0; i < numClients; i++ {
		go func(id int) {
			defer wg.Done()
			conn, _, err := websocket.DefaultDialer.Dial(wsURL+fmt.Sprint(id), nil)
			if err != nil {
				return
			}
			for j := 0; j < 50; j++ {
				msg := Message{Type: MessageTypeChat, Content: "hello"}
				conn.WriteJSON(msg)
				time.Sleep(1 * time.Millisecond)
			}
			conn.Close()
		}(i)
	}

	wg.Wait()
	close(done)
}

func TestEmptyRoomCleanup(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" {
			hub.ServeMetrics(w, r)
		} else {
			ServeWs(hub, w, r)
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=cleanup&user=user"

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to dial: %v", err)
	}
	time.Sleep(500 * time.Millisecond)

	resp, _ := http.Get(server.URL + "/metrics")
	var metrics map[string]float64
	json.NewDecoder(resp.Body).Decode(&metrics)
	resp.Body.Close()

	if metrics["total_rooms"] != 1 {
		t.Errorf("Expected 1 room, got %v", metrics["total_rooms"])
	}

	conn.Close()
	time.Sleep(1500 * time.Millisecond) // Wait for cleanup to propagate

	resp, _ = http.Get(server.URL + "/metrics")
	json.NewDecoder(resp.Body).Decode(&metrics)
	resp.Body.Close()

	if metrics["total_rooms"] != 0 {
		t.Errorf("Expected 0 rooms after disconnect, got %v. Room map leaked.", metrics["total_rooms"])
	}
}

func TestSlowClientHandling(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=slow&user="

	fastConn, _, err := websocket.DefaultDialer.Dial(wsURL+"fast", nil)
	if err != nil {
		t.Fatalf("Failed to dial: %v", err)
	}
	defer fastConn.Close()

	slowConn, _, err := websocket.DefaultDialer.Dial(wsURL+"slow", nil)
	if err != nil {
		t.Fatalf("Failed to dial: %v", err)
	}
	defer slowConn.Close()

	time.Sleep(500 * time.Millisecond)

	// Send many messages to trigger buffer full
	for i := 0; i < 500; i++ {
		msg := Message{Type: MessageTypeChat, Room: "slow", Content: "heavy load"}
		fastConn.WriteJSON(msg)
	}

	success := false
	for i := 0; i < 20; i++ {
		msg := Message{Type: MessageTypeChat, Room: "slow", Content: "ping"}
		fastConn.WriteJSON(msg)

		fastConn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		var m Message
		if err := fastConn.ReadJSON(&m); err == nil {
			success = true
			break
		}
	}

	if !success {
		t.Errorf("System blocked or fast client stopped receiving due to a slow client.")
	}
}

func TestGracefulShutdown(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=shutdown&user=user"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to dial: %v", err)
	}

	// Wait for registration to stabilize
	time.Sleep(1 * time.Second)

	start := time.Now()
	if !tryShutdownHub(hub) {
		t.Errorf("Graceful shutdown failed: hub does not have an exported Quit channel")
		return
	}

	// Connection should be closed by Hub's shutdown logic.
	// We use a separate goroutine to drain messages (e.g. initial presence)
	// and wait for the eventual error indicating closure.
	closed := make(chan bool, 1)
	go func() {
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				closed <- true
				return
			}
		}
	}()

	select {
	case <-closed:
		// Success
	case <-time.After(5 * time.Second):
		t.Error("Expected connection to be closed after shutdown, but it remained open after 5s")
	}

	// Should complete shutdown quickly
	if time.Since(start) > 7*time.Second {
		t.Errorf("Shutdown took too long: %v", time.Since(start))
	}
}

func TestMessageDelivery(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=delivery&user="

	conn1, _, _ := websocket.DefaultDialer.Dial(wsURL+"u1", nil)
	defer conn1.Close()
	conn2, _, _ := websocket.DefaultDialer.Dial(wsURL+"u2", nil)
	defer conn2.Close()

	time.Sleep(500 * time.Millisecond)

	content := "hello world"
	msg := Message{Type: MessageTypeChat, Room: "delivery", Content: content}
	conn1.WriteJSON(msg)

	delivered := false
	timeout := time.After(3 * time.Second)
	for !delivered {
		select {
		case <-timeout:
			t.Fatalf("Message not delivered within timeout")
		default:
			var received Message
			conn2.SetReadDeadline(time.Now().Add(1 * time.Second))
			if err := conn2.ReadJSON(&received); err != nil {
				continue
			}
			if received.Type == MessageTypeChat && received.Content == content {
				delivered = true
			}
		}
	}
}

func TestWriteBatchingEfficiency(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=batch&user=user"
	conn, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
	defer conn.Close()

	time.Sleep(500 * time.Millisecond)

	// Send multiple messages quickly
	numMsgs := 10
	for i := 0; i < numMsgs; i++ {
		hub.broadcast <- &Message{Room: "batch", Content: fmt.Sprintf("msg %d", i)}
	}

	// We should be able to read them all
	count := 0
	timeout := time.After(3 * time.Second)
	for count < numMsgs {
		select {
		case <-timeout:
			t.Fatalf("Read only %d/%d messages", count, numMsgs)
		default:
			conn.SetReadDeadline(time.Now().Add(1 * time.Second))
			_, data, err := conn.ReadMessage()
			if err != nil {
				t.Fatalf("Failed to read: %v", err)
			}
			// Batched messages might be separated by \n
			msgs := strings.Split(strings.TrimSpace(string(data)), "\n")
			count += len(msgs)
		}
	}
}

// TestPresenceBroadcastAccuracy verifies that presence messages contain the
// correct list of users when multiple clients join the same room.
func TestPresenceBroadcastAccuracy(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=presence&user="

	conn1, _, err := websocket.DefaultDialer.Dial(wsURL+"u1", nil)
	if err != nil {
		t.Fatalf("Failed to dial conn1: %v", err)
	}
	defer conn1.Close()

	conn2, _, err := websocket.DefaultDialer.Dial(wsURL+"u2", nil)
	if err != nil {
		t.Fatalf("Failed to dial conn2: %v", err)
	}
	defer conn2.Close()

	// Wait a moment for both clients to register and presence to be broadcast.
	time.Sleep(500 * time.Millisecond)

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		conn1.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
		var msg Message
		if err := conn1.ReadJSON(&msg); err != nil {
			continue
		}
		if msg.Type == MessageTypePresence && msg.Room == "presence" {
			// Users slice should contain both u1 and u2 in any order.
			foundU1, foundU2 := false, false
			for _, u := range msg.Users {
				if u == "u1" {
					foundU1 = true
				}
				if u == "u2" {
					foundU2 = true
				}
			}
			if foundU1 && foundU2 {
				return
			}
		}
	}

	t.Fatalf("Did not observe presence message with both users within timeout")
}

// TestPerRoomSubscriptionLifecycle ensures that per-room Redis subscription
// tracking (via Hub.stopSubs) is tied to room lifecycle: one entry per room
// while clients are present, and cleaned up when the last client leaves.
func TestPerRoomSubscriptionLifecycle(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	// Use reflection to check if stopSubs field exists
	v := reflect.ValueOf(hub)
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	stopSubsField := v.FieldByName("stopSubs")
	if !stopSubsField.IsValid() {
		t.Errorf("stopSubs field not present in Hub - per-room subscription tracking not implemented (Requirement 5)")
		return
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ServeWs(hub, w, r)
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=subs&user="

	conn1, _, err := websocket.DefaultDialer.Dial(wsURL+"u1", nil)
	if err != nil {
		t.Fatalf("Failed to dial conn1: %v", err)
	}
	defer conn1.Close()

	// Allow registration and subscription creation.
	time.Sleep(300 * time.Millisecond)

	// Use reflection to get stopSubs length
	stopSubsField = reflect.ValueOf(hub).Elem().FieldByName("stopSubs")
	if stopSubsField.Len() != 1 {
		t.Fatalf("expected 1 stopSub entry after first client, got %d", stopSubsField.Len())
	}

	conn2, _, err := websocket.DefaultDialer.Dial(wsURL+"u2", nil)
	if err != nil {
		t.Fatalf("Failed to dial conn2: %v", err)
	}
	defer conn2.Close()

	time.Sleep(300 * time.Millisecond)

	// Still only one per-room subscription for the same room.
	stopSubsField = reflect.ValueOf(hub).Elem().FieldByName("stopSubs")
	if stopSubsField.Len() != 1 {
		t.Fatalf("expected 1 stopSub entry after second client, got %d", stopSubsField.Len())
	}

	// Close both clients and wait for room cleanup.
	conn1.Close()
	conn2.Close()
	time.Sleep(1500 * time.Millisecond)

	stopSubsField = reflect.ValueOf(hub).Elem().FieldByName("stopSubs")
	if stopSubsField.Len() != 0 {
		t.Fatalf("expected 0 stopSub entries after all clients left, got %d", stopSubsField.Len())
	}
}

// TestMetricsUnderChurn ensures the metrics endpoint remains responsive and
// returns sane values while clients are rapidly connecting and disconnecting.
func TestMetricsUnderChurn(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" {
			hub.ServeMetrics(w, r)
		} else {
			ServeWs(hub, w, r)
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws?room=churn&user="

	// Churn goroutine: repeatedly connect and disconnect short-lived clients.
	stop := make(chan struct{})
	go func() {
		for {
			select {
			case <-stop:
				return
			default:
				conn, _, err := websocket.DefaultDialer.Dial(wsURL+fmt.Sprint(time.Now().UnixNano()), nil)
				if err == nil {
					time.Sleep(5 * time.Millisecond)
					conn.Close()
				} else {
					time.Sleep(5 * time.Millisecond)
				}
			}
		}
	}()

	// Repeatedly hit /metrics and ensure we always get a valid JSON response.
	start := time.Now()
	for i := 0; i < 100; i++ {
		resp, err := http.Get(server.URL + "/metrics")
		if err != nil {
			close(stop)
			t.Fatalf("metrics request failed: %v", err)
		}
		var metrics map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&metrics); err != nil {
			resp.Body.Close()
			close(stop)
			t.Fatalf("failed to decode metrics: %v", err)
		}
		resp.Body.Close()

		// Sanity checks: counts should be non-negative.
		if c, ok := metrics["total_clients"].(float64); ok && c < 0 {
			close(stop)
			t.Fatalf("total_clients is negative: %v", c)
		}
		if r, ok := metrics["total_rooms"].(float64); ok && r < 0 {
			close(stop)
			t.Fatalf("total_rooms is negative: %v", r)
		}
	}
	close(stop)

	// The entire metrics loop should be reasonably fast (loose bound to avoid flakiness).
	if time.Since(start) > 3*time.Second {
		t.Fatalf("metrics under churn test took too long: %v", time.Since(start))
	}
}
