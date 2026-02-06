package tests

import (
	"runtime"
	"testing"
	"time"

	"github.com/example/connpool"
)

func TestPoolCloseStopsGoroutines(t *testing.T) {
	// GC to stabilize goroutine count
	runtime.GC()
	time.Sleep(10 * time.Millisecond)
	baseline := runtime.NumGoroutine()
	
	config := pool.DefaultConfig()
	p := pool.NewPool(config)
	
	// Give a moment for goroutines to start
	time.Sleep(20 * time.Millisecond)
	
	afterStart := runtime.NumGoroutine()
	if afterStart <= baseline {
		t.Errorf("Expected more goroutines after pool creation, got %d <= %d", afterStart, baseline)
	}

	p.Close()

	// Wait up to 2 seconds for goroutines to stop
	timeout := time.After(2 * time.Second)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			final := runtime.NumGoroutine()
			t.Errorf("Goroutines didn't stop within 2s. Baseline: %d, Start: %d, Final: %d", baseline, afterStart, final)
			return
		case <-ticker.C:
			current := runtime.NumGoroutine()
			// Allow more jitter (+3) because of go test -json and background runtime activity
			if current <= baseline+3 {
				return
			}
		}
	}
}

func TestPoolCloseIsIdempotent(t *testing.T) {
	config := pool.DefaultConfig()
	p := pool.NewPool(config)
	
	// Multiple close calls should not panic or deadlock
	p.Close()
	p.Close()
	p.Close()
}
