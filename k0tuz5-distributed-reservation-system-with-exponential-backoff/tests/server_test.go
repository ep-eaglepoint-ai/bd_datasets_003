package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
)

type reserveRequest struct {
	ResourceID string `json:"resource_id"`
	Quantity   int    `json:"quantity"`
}

const baseURL = "http://localhost:8080"

func TestConcurrentReservations(t *testing.T) {
	t.Setenv("PORT", "8080")
	stop := startServer(t)
	defer stop()

	var wg sync.WaitGroup
	var successCount int32
	totalRequests := 10

	for i := 0; i < totalRequests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			payload := reserveRequest{"item-1", 10}
			body, _ := json.Marshal(payload)
			resp, err := http.Post(baseURL+"/reserve", "application/json", bytes.NewBuffer(body))
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

	// Stock = 50, so successCount must not exceed 5
	if atomic.LoadInt32(&successCount) > 5 {
		t.Errorf("overselling occurred, successCount=%d", successCount)
	}
}

func TestInsufficientStock(t *testing.T) {
	t.Setenv("PORT", "8080")
	stop := startServer(t)
	defer stop()

	// Request 100 units when only 50 available
	payload := reserveRequest{"item-1", 100}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(baseURL+"/reserve", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusConflict {
		t.Errorf("expected 409 Conflict, got %d", resp.StatusCode)
	}
}

func TestInvalidJSON(t *testing.T) {
	t.Setenv("PORT", "8080")
	stop := startServer(t)
	defer stop()

	resp, err := http.Post(baseURL+"/reserve", "application/json", bytes.NewBuffer([]byte("{invalid json}")))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request, got %d", resp.StatusCode)
	}
}

func TestRateLimiter(t *testing.T) {
	t.Setenv("PORT", "8080")
	stop := startServer(t)
	defer stop()
	var wg sync.WaitGroup
	var tooMany int32
	totalRequests := 100

	for i := 0; i < totalRequests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			payload := reserveRequest{"item-1", 1}
			body, _ := json.Marshal(payload)
			resp, _ := http.Post(baseURL+"/reserve", "application/json", bytes.NewBuffer(body))
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
	t.Setenv("PORT", "8080")
	stop := startServer(t)
	defer stop()

	inventory := 50
	var mu sync.Mutex
	success := 0
	var wg sync.WaitGroup
	for i := 0; i < 25; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			payload := reserveRequest{"item-1", 2}
			body, _ := json.Marshal(payload)
			resp, _ := http.Post(baseURL+"/reserve", "application/json", bytes.NewBuffer(body))
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
