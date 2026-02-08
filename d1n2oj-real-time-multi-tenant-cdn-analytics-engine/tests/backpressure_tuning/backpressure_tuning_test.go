package backpressure_tuning_test

import (
	"io"
	"log/slog"
	"runtime"
	"sync"
	"testing"
	"time"

	"github.com/ep-eaglepoint-ai/bd_datasets_003/d1n2oj-real-time-multi-tenant-cdn-analytics-engine/repository_after/pkg/tuning"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}


func TestDefaultRuntimeConfig(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()

	if cfg.MaxProcs != 2 {
		t.Errorf("Expected MaxProcs=2, got %d", cfg.MaxProcs)
	}
	if cfg.TargetRatePerSec != 8000 {
		t.Errorf("Expected TargetRatePerSec=8000, got %d", cfg.TargetRatePerSec)
	}
	if cfg.ThrottleWindow != 1*time.Second {
		t.Errorf("Expected ThrottleWindow=1s, got %v", cfg.ThrottleWindow)
	}
	if cfg.ThrottleBurstMs != 500 {
		t.Errorf("Expected ThrottleBurstMs=500, got %d", cfg.ThrottleBurstMs)
	}
}



func TestApplyGOMAXPROCS(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	cfg.MaxProcs = 2

	prev := tuning.ApplyGOMAXPROCS(cfg, testLogger())
	current := runtime.GOMAXPROCS(0)

	if current != 2 {
		t.Errorf("Expected GOMAXPROCS=2 after apply, got %d", current)
	}

	// Restore
	runtime.GOMAXPROCS(prev)
}



func TestRateMonitorBelowThreshold(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	cfg.TargetRatePerSec = 1_000_000 // very high cap
	cfg.ThrottleWindow = 1 * time.Second
	rm := tuning.NewRateMonitor(cfg, testLogger())
	time.Sleep(10 * time.Millisecond) 
	throttled := rm.RecordEvents(100) 
	if throttled {
		t.Error("Expected no throttle for 100 events with 1M cap")
	}
	if rm.IsThrottled() {
		t.Error("IsThrottled should be false")
	}
}


func TestRateMonitorAboveThreshold(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	cfg.TargetRatePerSec = 100 // very low cap
	cfg.ThrottleWindow = 1 * time.Second
	rm := tuning.NewRateMonitor(cfg, testLogger())

	// Record way more than allowed in a short burst
	throttled := rm.RecordEvents(500)
	if !throttled {
		t.Error("Expected throttle for 500 events with 100/sec cap")
	}
	if !rm.IsThrottled() {
		t.Error("IsThrottled should be true")
	}
}


func TestRateMonitorWindowRotation(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	cfg.TargetRatePerSec = 100
	cfg.ThrottleWindow = 50 * time.Millisecond // very short window
	rm := tuning.NewRateMonitor(cfg, testLogger())

	// Trigger throttle
	rm.RecordEvents(500)
	if !rm.IsThrottled() {
		t.Fatal("Should be throttled after burst")
	}

	// Wait for window to rotate
	time.Sleep(100 * time.Millisecond)

	// Small batch after rotation should un-throttle
	rm.RecordEvents(1)
	if rm.IsThrottled() {
		t.Error("Should no longer be throttled after window rotation + small batch")
	}
}


func TestRateMonitorMetrics(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	cfg.TargetRatePerSec = 8000
	rm := tuning.NewRateMonitor(cfg, testLogger())

	rm.RecordEvents(50)
	rm.RecordDropped(10)

	metrics := rm.GetMetrics()

	if metrics["target_rate_per_sec"] != 8000 {
		t.Errorf("Expected target_rate=8000, got %v", metrics["target_rate_per_sec"])
	}
	if metrics["total_ingested"].(int64) != 50 {
		t.Errorf("Expected total_ingested=50, got %v", metrics["total_ingested"])
	}
	if metrics["dropped_events"].(int64) != 10 {
		t.Errorf("Expected dropped_events=10, got %v", metrics["dropped_events"])
	}
	if _, ok := metrics["gomaxprocs"]; !ok {
		t.Error("Expected gomaxprocs in metrics")
	}
	if _, ok := metrics["num_goroutine"]; !ok {
		t.Error("Expected num_goroutine in metrics")
	}
	if _, ok := metrics["current_rate_per_sec"]; !ok {
		t.Error("Expected current_rate_per_sec in metrics")
	}
}


func TestRateMonitorReset(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	cfg.TargetRatePerSec = 100
	rm := tuning.NewRateMonitor(cfg, testLogger())

	rm.RecordEvents(500)
	rm.RecordDropped(100)

	rm.Reset()

	if rm.IsThrottled() {
		t.Error("Should not be throttled after reset")
	}
	metrics := rm.GetMetrics()
	if metrics["total_ingested"].(int64) != 0 {
		t.Errorf("Expected total_ingested=0 after reset, got %v", metrics["total_ingested"])
	}
	if metrics["dropped_events"].(int64) != 0 {
		t.Errorf("Expected dropped_events=0 after reset, got %v", metrics["dropped_events"])
	}
}


func TestRateMonitorConcurrentSafety(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	cfg.TargetRatePerSec = 100000 // high cap to avoid throttle
	rm := tuning.NewRateMonitor(cfg, testLogger())

	var wg sync.WaitGroup
	const goroutines = 50
	const eventsPerGoroutine = 100

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < eventsPerGoroutine; j++ {
				rm.RecordEvents(1)
			}
		}()
	}

	wg.Wait()

	metrics := rm.GetMetrics()
	total := metrics["total_ingested"].(int64)
	expected := int64(goroutines * eventsPerGoroutine)
	if total != expected {
		t.Errorf("Expected total_ingested=%d, got %d", expected, total)
	}
}


func TestRateMonitorThrottleActivationsCount(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	cfg.TargetRatePerSec = 50
	cfg.ThrottleWindow = 50 * time.Millisecond
	rm := tuning.NewRateMonitor(cfg, testLogger())


	rm.RecordEvents(500)

	time.Sleep(100 * time.Millisecond)


	rm.RecordEvents(1)

	time.Sleep(100 * time.Millisecond)


	rm.RecordEvents(500)

	metrics := rm.GetMetrics()
	activations := metrics["throttle_activations"].(int64)
	if activations < 2 {
		t.Errorf("Expected at least 2 throttle activations, got %d", activations)
	}
}


func TestConfigHasTuningFields(t *testing.T) {
	cfg := tuning.DefaultRuntimeConfig()
	if cfg.MaxProcs <= 0 {
		t.Errorf("MaxProcs should be > 0, got %d", cfg.MaxProcs)
	}
	if cfg.TargetRatePerSec <= 0 {
		t.Errorf("TargetRatePerSec should be > 0, got %d", cfg.TargetRatePerSec)
	}
}
