package tests

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/example/connpool"
)

func TestMetricsNeverNegative(t *testing.T) {
	config := pool.DefaultConfig()
	p := pool.NewPool(config)
	defer p.Close()

	stats := p.GetStats()
	
	// Try to force negative by calling decrement on zero (though pool shouldn't do this)
	// We want to ensure our metrics layer handles it or doesn't allow it.
	// Since we are testing the Pool's stats, we'll use the pool.
	
	// Acquire and release many times
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer server.Close()
	host := server.URL[7:]

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			conn, _ := p.Get(context.Background(), host)
			if conn != nil {
				p.Release(conn)
			}
		}()
	}
	wg.Wait()

	if stats.GetTotal() < 0 || stats.GetActive() < 0 || stats.GetIdle() < 0 {
		t.Errorf("Metrics went negative: Total=%d, Active=%d, Idle=%d", 
			stats.GetTotal(), stats.GetActive(), stats.GetIdle())
	}
}

func TestMetricsConsistencyUnderConcurrency(t *testing.T) {
	config := pool.DefaultConfig()
	config.MaxConnsPerHost = 10
	p := pool.NewPool(config)
	defer p.Close()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer server.Close()
	host := server.URL[7:]

	var wg sync.WaitGroup
	for i := 0; i < 1000; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			conn, err := p.Get(context.Background(), host)
			if err == nil {
				p.Release(conn)
			}
		}()
	}
	wg.Wait()

	stats := p.GetStats()
	total := stats.GetTotal()
	active := stats.GetActive()
	idle := stats.GetIdle()

	if total != active+idle {
		t.Errorf("Inconsistent metrics: Total(%d) != Active(%d) + Idle(%d)", total, active, idle)
	}
}
