package tuning

import (
	"log/slog"
	"runtime"
	"sync/atomic"
	"time"
)


type RuntimeConfig struct {

	MaxProcs int
	TargetRatePerSec int           
	ThrottleWindow   time.Duration 
	ThrottleBurstMs int
}


func DefaultRuntimeConfig() *RuntimeConfig {
	return &RuntimeConfig{
		MaxProcs:         2,
		TargetRatePerSec: 8_000,
		ThrottleWindow:   1 * time.Second,
		ThrottleBurstMs:  500,
	}
}


func ApplyGOMAXPROCS(cfg *RuntimeConfig, logger *slog.Logger) int {
	prev := runtime.GOMAXPROCS(cfg.MaxProcs)
	logger.Info("GOMAXPROCS configured",
		"previous", prev,
		"current", cfg.MaxProcs,
		"num_cpu", runtime.NumCPU(),
	)
	return prev
}


type RateMonitor struct {
	cfg *RuntimeConfig


	currentCount  atomic.Int64 
	windowStart   atomic.Int64 
	totalIngested atomic.Int64 
	throttled     atomic.Bool  

	
	throttleActivations atomic.Int64
	droppedEvents       atomic.Int64

	logger *slog.Logger
}


func NewRateMonitor(cfg *RuntimeConfig, logger *slog.Logger) *RateMonitor {
	rm := &RateMonitor{
		cfg:    cfg,
		logger: logger,
	}
	rm.windowStart.Store(time.Now().UnixNano())
	return rm
}


func (rm *RateMonitor) RecordEvents(n int) bool {
	rm.totalIngested.Add(int64(n))
	newCount := rm.currentCount.Add(int64(n))


	ws := rm.windowStart.Load()
	elapsed := time.Duration(time.Now().UnixNano() - ws)

	if elapsed >= rm.cfg.ThrottleWindow {
	
		now := time.Now().UnixNano()
		if rm.windowStart.CompareAndSwap(ws, now) {
			rm.currentCount.Store(int64(n))
			newCount = int64(n)
		}
	}
	windowFraction := float64(elapsed) / float64(rm.cfg.ThrottleWindow)
	if windowFraction <= 0 {
		windowFraction = 0.001
	}
	allowedInWindow := float64(rm.cfg.TargetRatePerSec) * windowFraction

	shouldThrottle := float64(newCount) > allowedInWindow*1.1 
	wasThrottled := rm.throttled.Load()
	if shouldThrottle && !wasThrottled {
		rm.throttled.Store(true)
		rm.throttleActivations.Add(1)
		rm.logger.Warn("Dynamic throttle activated",
			"current_count", newCount,
			"allowed", int64(allowedInWindow),
			"window_fraction", windowFraction,
		)
	} else if !shouldThrottle && wasThrottled {
		rm.throttled.Store(false)
		rm.logger.Info("Dynamic throttle deactivated")
	}
	return rm.throttled.Load()
}
func (rm *RateMonitor) IsThrottled() bool {
	return rm.throttled.Load()
}

func (rm *RateMonitor) RecordDropped(n int) {
	rm.droppedEvents.Add(int64(n))
}

func (rm *RateMonitor) GetMetrics() map[string]interface{} {
	ws := rm.windowStart.Load()
	elapsed := time.Duration(time.Now().UnixNano() - ws)
	currentCount := rm.currentCount.Load()

	var currentRate float64
	if elapsed > 0 {
		currentRate = float64(currentCount) / elapsed.Seconds()
	}

	return map[string]interface{}{
		"target_rate_per_sec":  rm.cfg.TargetRatePerSec,
		"current_window_count": currentCount,
		"current_rate_per_sec": currentRate,
		"total_ingested":       rm.totalIngested.Load(),
		"throttled":            rm.throttled.Load(),
		"throttle_activations": rm.throttleActivations.Load(),
		"dropped_events":       rm.droppedEvents.Load(),
		"gomaxprocs":           runtime.GOMAXPROCS(0),
		"num_goroutine":        runtime.NumGoroutine(),
	}
}
func (rm *RateMonitor) Reset() {
	rm.currentCount.Store(0)
	rm.windowStart.Store(time.Now().UnixNano())
	rm.totalIngested.Store(0)
	rm.throttled.Store(false)
	rm.throttleActivations.Store(0)
	rm.droppedEvents.Store(0)
}
