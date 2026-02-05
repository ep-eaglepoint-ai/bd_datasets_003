package proxy

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestLegacyCircuitBreakerBasic tests basic functionality
func TestLegacyCircuitBreakerBasic(t *testing.T) {
	breaker := NewLegacyBreaker(3, 100*time.Millisecond)
	
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	
	req, _ := http.NewRequest("GET", server.URL, nil)
	resp, err := breaker.RoundTrip(req, http.DefaultTransport)
	
	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
	if resp == nil || resp.StatusCode != http.StatusOK {
		t.Error("Expected successful response")
	}
	
	t.Log("Legacy circuit breaker basic functionality works")
}

// TestLegacyCircuitBreakerFailures tests circuit opening on failures
func TestLegacyCircuitBreakerFailures(t *testing.T) {
	breaker := NewLegacyBreaker(2, 100*time.Millisecond)
	
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	
	req, _ := http.NewRequest("GET", server.URL, nil)
	
	// Make enough requests to trip the circuit
	for i := 0; i < 3; i++ {
		breaker.RoundTrip(req, http.DefaultTransport)
	}
	
	// Next request should be rejected
	_, err := breaker.RoundTrip(req, http.DefaultTransport)
	if err != ErrCircuitOpen {
		t.Errorf("Expected ErrCircuitOpen, got %v", err)
	}
	
	t.Log("Legacy circuit breaker correctly opens on failures")
}

// BenchmarkLegacyCircuitBreaker provides benchmark for legacy implementation
func BenchmarkLegacyCircuitBreaker(b *testing.B) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	
	breaker := NewLegacyBreaker(10, 1*time.Second)
	req, _ := http.NewRequest("GET", server.URL, nil)
	
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			breaker.RoundTrip(req, http.DefaultTransport)
		}
	})
}

// TestLegacyPerformanceMetrics measures legacy performance characteristics
func TestLegacyPerformanceMetrics(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	breaker := NewLegacyBreaker(10, 1*time.Second)
	req, _ := http.NewRequest("GET", server.URL, nil)
	
	const numRequests = 1000
	const numGoroutines = 50  // Reduced for legacy performance
	
	var wg sync.WaitGroup
	var totalRequests int64
	
	start := time.Now()
	wg.Add(numGoroutines)
	
	for i := 0; i < numGoroutines; i++ {
		go func() {
			defer wg.Done()
			for j := 0; j < numRequests/numGoroutines; j++ {
				breaker.RoundTrip(req, http.DefaultTransport)
				atomic.AddInt64(&totalRequests, 1)
			}
		}()
	}
	
	wg.Wait()
	duration := time.Since(start)
	throughput := float64(totalRequests) / duration.Seconds()
	
	t.Logf("Legacy Performance Metrics:")
	t.Logf("  Total Requests: %d", totalRequests)
	t.Logf("  Duration: %v", duration)
	t.Logf("  Throughput: %.0f req/sec", throughput)
	t.Logf("  Average latency: %v", duration/time.Duration(totalRequests))
}