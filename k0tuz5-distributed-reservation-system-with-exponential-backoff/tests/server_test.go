package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"reservation-system/repository_after/model"
)

func startTestServer() *httptest.Server {
	inventory := &model.Inventory{
		Items: map[string]int{
			"item-1": 5,
		},
	}
	rateLimiter := model.NewRateLimiter(100)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rateLimiter.Allow() {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		defer r.Body.Close()
		var req model.ReserveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		inventory.Mu.Lock()
		defer inventory.Mu.Unlock()
		current := inventory.Items[req.ResourceID]
		if current < req.Quantity {
			http.Error(w, "insufficient stock", http.StatusConflict)
			return
		}
		inventory.Items[req.ResourceID] -= req.Quantity
		w.WriteHeader(http.StatusOK)
	})

	return httptest.NewServer(handler)
}

func TestConcurrentReservations(t *testing.T) {
	server := startTestServer()
	defer server.Close()

	var wg sync.WaitGroup
	var successCount int32
	totalRequests := 10

	for i := 0; i < totalRequests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			payload := model.ReserveRequest{"item-1", 1}
			body, _ := json.Marshal(payload)
			resp, err := http.Post(server.URL, "application/json", bytes.NewBuffer(body))
			if err != nil {
				t.Errorf("request failed: %v", err)
				return
			}
			defer resp.Body.Close()

			if resp.StatusCode == http.StatusOK {
				atomic.AddInt32(&successCount, 1)
			} else if resp.StatusCode != http.StatusConflict {
				t.Errorf("unexpected status: %d", resp.StatusCode)
			}
		}()
	}

	wg.Wait()

	// Stock = 5, so successCount must not exceed 5
	if atomic.LoadInt32(&successCount) > 5 {
		t.Errorf("overselling occurred, successCount=%d", successCount)
	}
}

func TestInsufficientStock(t *testing.T) {
	server := startTestServer()
	defer server.Close()

	// Request 10 units when only 5 available
	payload := model.ReserveRequest{"item-1", 10}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(server.URL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusConflict {
		t.Errorf("expected 409 Conflict, got %d", resp.StatusCode)
	}
}

func TestInvalidJSON(t *testing.T) {
	server := startTestServer()
	defer server.Close()

	resp, err := http.Post(server.URL, "application/json", bytes.NewBuffer([]byte("{invalid json}")))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request, got %d", resp.StatusCode)
	}
}

func TestRateLimiter(t *testing.T) {
	rateLimiter := model.NewRateLimiter(5) // 5 requests/sec
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rateLimiter.Allow() {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	var wg sync.WaitGroup
	totalRequests := 10
	var tooMany int32
	for i := 0; i < totalRequests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, _ := http.Get(server.URL)
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusTooManyRequests {
				atomic.AddInt32(&tooMany, 1)
			}
		}()
	}

	wg.Wait()

	if atomic.LoadInt32(&tooMany) == 0 {
		t.Errorf("rate limiter did not trigger")
	}
}

func TestServerSerializability(t *testing.T) {
	server := startTestServer()
	defer server.Close()

	inventory := 5
	var mu sync.Mutex
	success := 0
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			payload := model.ReserveRequest{"item-1", 1}
			body, _ := json.Marshal(payload)
			resp, _ := http.Post(server.URL, "application/json", bytes.NewBuffer(body))
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				mu.Lock()
				success++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if success > inventory {
		t.Errorf("overselling detected, success=%d", success)
	}
}
