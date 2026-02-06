package tests

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/example/connpool"
)

func TestRequestCancelledWithin100ms(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Second) // Slow server
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	config := pool.DefaultConfig()
	p := pool.NewPool(config)
	defer p.Close()

	ctx, cancel := context.WithCancel(context.Background())
	
	req, _ := http.NewRequest("GET", server.URL, nil)
	
	start := time.Now()
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	_, err := p.Do(ctx, req)
	duration := time.Since(start)

	if err == nil {
		t.Error("Expected error from cancelled context, got nil")
	}
	
	if duration > 150*time.Millisecond {
		t.Errorf("Request took too long to return after cancellation: %v", duration)
	}
}

func TestCancelledRequestMarksConnectionUnhealthy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
	}))
	defer server.Close()

	config := pool.DefaultConfig()
	config.MaxConnsPerHost = 1
	p := pool.NewPool(config)
	defer p.Close()

	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequest("GET", server.URL, nil)

	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	// First request gets cancelled
	_, err := p.Do(ctx, req)
	if err == nil {
		t.Error("Expected error, got nil")
	}

	// The connection used should now be unhealthy and removed from pool.
	// Since MaxConnsPerHost is 1, if it was healthy it would be reused.
	// If it's unhealthy, p.Do should create a NEW connection and succeed.
	
	newCtx := context.Background()
	req2, _ := http.NewRequest("GET", server.URL, nil)
	
	// Use a short timeout to ensure we don't wait for a "leaked" connection if logic is broken
	shortCtx, shortCancel := context.WithTimeout(newCtx, 500*time.Millisecond)
	defer shortCancel()

	// This should succeed because the previous connection should have been marked unhealthy and released/removed.
	// Note: Our current Release logic removes unhealthy connections from pool.connections but we need to ensure Get creates a new one.
	_, err = p.Do(shortCtx, req2)
	if err != nil {
		t.Errorf("Expected second request to succeed on a new connection, got error: %v", err)
	}

	stats := p.GetStats()
	if stats.GetFailed() < 1 {
		t.Errorf("Expected at least 1 failed connection, got %d", stats.GetFailed())
	}
	// Total should be 1 (the second request's connection) because the first one was removed from stats
	if stats.GetTotal() != 1 {
		t.Errorf("Expected 1 total connection (second one), got %d", stats.GetTotal())
	}
}
