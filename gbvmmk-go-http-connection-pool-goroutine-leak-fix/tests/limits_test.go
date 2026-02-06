package tests

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/example/connpool"
)

func TestMaxConnectionsPerHostEnforced(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond) // Simulate slow request
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	host := server.URL[7:] // remove http://
	config := pool.DefaultConfig()
	config.MaxConnsPerHost = 2
	p := pool.NewPool(config)
	defer p.Close()

	var wg sync.WaitGroup
	ctx := context.Background()

	// Acquire MaxConnsPerHost
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.Get(ctx, host)
		}()
	}
	wg.Wait()

	// Try to acquire one more, it should block.
	// We use a context with timeout to check if it blocks.
	timeoutCtx, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
	defer cancel()

	_, err := p.Get(timeoutCtx, host)
	if err == nil {
		t.Error("Expected Get to block and timeout, but it succeeded")
	} else if err != context.DeadlineExceeded {
		t.Errorf("Expected context deadline exceeded error, got %v", err)
	}
}

func TestPerHostIsolation(t *testing.T) {
	serverA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
	}))
	defer serverA.Close()

	serverB := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer serverB.Close()

	hostA := serverA.URL[7:]
	hostB := serverB.URL[7:]

	config := pool.DefaultConfig()
	config.MaxConnsPerHost = 1
	p := pool.NewPool(config)
	defer p.Close()

	// Saturate Host A
	p.Get(context.Background(), hostA)

	// Host B should still be accessible
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err := p.Get(ctx, hostB)
	if err != nil {
		t.Errorf("Host B should be accessible even if Host A is saturated, got error: %v", err)
	}
}

func TestContextCancelWhileWaiting(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Second)
	}))
	defer server.Close()

	host := server.URL[7:]
	config := pool.DefaultConfig()
	config.MaxConnsPerHost = 1
	p := pool.NewPool(config)
	defer p.Close()

	// Saturate
	p.Get(context.Background(), host)

	// Wait with context that will be cancelled
	ctx, cancel := context.WithCancel(context.Background())
	
	start := time.Now()
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancel()
	}()

	_, err := p.Get(ctx, host)
	duration := time.Since(start)

	if err == nil {
		t.Error("Expected error from cancelled context, got nil")
	}
	if duration > 150*time.Millisecond {
		t.Errorf("Get took too long to return after cancellation: %v", duration)
	}
}
