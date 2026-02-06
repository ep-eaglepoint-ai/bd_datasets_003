package tests

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/example/connpool"
)

func TestIdleConnectionsEvicted(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	host := server.URL[7:]
	config := pool.DefaultConfig()
	config.IdleTimeout = 100 * time.Millisecond
	p := pool.NewPool(config)
	defer p.Close()

	// 1. Acquire and release a connection
	conn, err := p.Get(context.Background(), host)
	if err != nil {
		t.Fatalf("Failed to get connection: %v", err)
	}
	p.Release(conn)

	// 2. Verify it's idle
	stats := p.GetStats()
	if stats.GetIdle() != 1 {
		t.Errorf("Expected 1 idle connection, got %d", stats.GetIdle())
	}

	// 3. Wait for eviction (IdleTimeout + buffer)
	time.Sleep(300 * time.Millisecond)

	// 4. Verify it's gone
	stats = p.GetStats()
	if stats.GetIdle() != 0 {
		t.Errorf("Expected 0 idle connections after timeout, got %d", stats.GetIdle())
	}
	if stats.GetTotal() != 0 {
		t.Errorf("Expected 0 total connections, got %d", stats.GetTotal())
	}
}

func TestActiveConnectionsNotEvicted(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(500 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	host := server.URL[7:]
	config := pool.DefaultConfig()
	config.IdleTimeout = 100 * time.Millisecond
	p := pool.NewPool(config)
	defer p.Close()

	// 1. Acquire a connection and keep it "active"
	conn, err := p.Get(context.Background(), host)
	if err != nil {
		t.Fatalf("Failed to get connection: %v", err)
	}
	// We DON'T release it yet

	// 2. Wait for what WOULD be an idle timeout
	time.Sleep(300 * time.Millisecond)

	// 3. Verify it's still active and total is 1
	stats := p.GetStats()
	if stats.GetActive() != 1 {
		t.Errorf("Expected 1 active connection, got %d", stats.GetActive())
	}
	if stats.GetTotal() != 1 {
		t.Errorf("Expected 1 total connection, got %d", stats.GetTotal())
	}

	// 4. Release and verify it becomes idle
	p.Release(conn)
	stats = p.GetStats()
	if stats.GetIdle() != 1 {
		t.Errorf("Expected 1 idle connection after release, got %d", stats.GetIdle())
	}

	// 5. Wait for eviction
	time.Sleep(300 * time.Millisecond)
	stats = p.GetStats()
	if stats.GetIdle() != 0 {
		t.Errorf("Expected connection to be evicted eventually after release, got %d", stats.GetIdle())
	}
}
