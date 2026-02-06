package tests

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/example/connpool"
)

func TestGoroutineStabilityUnderLoad(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(10 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	config := pool.DefaultConfig()
	config.MaxConnsPerHost = 10
	config.HealthCheckPeriod = 50 * time.Millisecond
	config.DNSRefreshPeriod = 50 * time.Millisecond
	p := pool.NewPool(config)
	defer p.Close()

	host := server.URL[7:]
	
	baselineGoroutines := runtime.NumGoroutine()
	
	var wg sync.WaitGroup
	for i := 0; i < 500; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
			defer cancel()
			
			resp, err := p.Do(ctx, &http.Request{URL: &url.URL{Host: host, Scheme: "http"}})
			if err == nil {
				resp.Body.Close()
			}
		}(i)
	}
	wg.Wait()

	// Wait a bit for idle workers to settle
	time.Sleep(200 * time.Millisecond)
	
	currentGoroutines := runtime.NumGoroutine()
	// We expect some background goroutines: 1 evictor, 1 DNS refresher, 1 health checker (main loop)
	// plus whatever the testing framework uses. 
	// The key is that it shouldn't be hundreds.
	if currentGoroutines > baselineGoroutines + 50 {
		t.Errorf("Potential goroutine leak: baseline %d, current %d", baselineGoroutines, currentGoroutines)
	}
}

func TestGracefulShutdownUnderTraffic(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	config := pool.DefaultConfig()
	config.MaxConnsPerHost = 20
	p := pool.NewPool(config)

	host := server.URL[7:]
	
	errs := make(chan error, 100)
	var wg sync.WaitGroup
	
	// Start background traffic
	stopTraffic := make(chan struct{})
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stopTraffic:
					return
				default:
					ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
					resp, err := p.Do(ctx, &http.Request{URL: &url.URL{Host: host, Scheme: "http"}})
					if err == nil {
						resp.Body.Close()
					} else {
						errs <- err
					}
					cancel()
					time.Sleep(10 * time.Millisecond)
				}
			}
		}()
	}

	time.Sleep(100 * time.Millisecond)
	
	// Close pool while traffic is ongoing
	start := time.Now()
	p.Close()
	duration := time.Since(start)

	close(stopTraffic)
	wg.Wait()

	if duration > 1*time.Second {
		t.Errorf("Shutdown took too long: %v", duration)
	}
	
	// After Close, further Do calls SHOULD fail immediately
	_, err := p.Do(context.Background(), &http.Request{URL: &url.URL{Host: host, Scheme: "http"}})
	if err == nil {
		t.Error("Expected error calling Do on closed pool, got nil")
	}
}

func TestNoConnectionExhaustionSimulation(t *testing.T) {
	// Simulate many hosts each with many requests
	config := pool.DefaultConfig()
	config.MaxConnsPerHost = 2
	p := pool.NewPool(config)
	defer p.Close()

	var wg sync.WaitGroup
	numHosts := 10
	reqsPerHost := 10
	
	servers := make([]*httptest.Server, numHosts)
	for i := 0; i < numHosts; i++ {
		servers[i] = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer servers[i].Close()
	}

	for i := 0; i < numHosts; i++ {
		host := servers[i].URL[7:]
		for j := 0; j < reqsPerHost; j++ {
			wg.Add(1)
			go func(h string) {
				defer wg.Done()
				ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
				defer cancel()
				resp, err := p.Do(ctx, &http.Request{URL: &url.URL{Host: h, Scheme: "http"}})
				if err == nil {
					resp.Body.Close()
				} else {
					fmt.Printf("Error for host %s: %v\n", h, err)
				}
			}(host)
		}
	}
	wg.Wait()

	stats := p.GetStats()
	// Should have max numHosts * 2 connections ever created if limit is respected
	// and they were reused.
	if stats.GetTotal() > int64(numHosts * 2) {
		t.Errorf("Connection pool exceeded per-host limits: total %d, expected max %d", stats.GetTotal(), numHosts*2)
	}
}
