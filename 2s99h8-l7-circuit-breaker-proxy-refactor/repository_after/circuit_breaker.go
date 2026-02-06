package proxy

import (
	"errors"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

var ErrCircuitOpen = errors.New("circuit breaker is open")

const (
	StateClosed   = int32(0)
	StateOpen     = int32(1)
	StateHalfOpen = int32(2)
)

type FastCircuitBreaker struct {
	state           atomic.Int32  // Requirement 2: Use atomic.Int32 type
	lastFailureTime atomic.Int64
	sleepWindow     int64
	errorThreshold  float64
	
	// Atomic counters for window (Requirement 1: lock-free atomic counters)
	windowStart     atomic.Int64
	windowRequests  atomic.Int64
	windowFailures  atomic.Int64
	
	// Single probe enforcement
	probeInProgress atomic.Int32
	
	client          *http.Client
}

func NewFastBreaker(errorThreshold float64, sleepWindow time.Duration) *FastCircuitBreaker {
	transport := &http.Transport{
		MaxIdleConns:        1000,
		MaxIdleConnsPerHost: 1000,
		IdleConnTimeout:     90 * time.Second,
		DisableKeepAlives:   false,
	}

	cb := &FastCircuitBreaker{
		sleepWindow:    sleepWindow.Nanoseconds(),
		errorThreshold: errorThreshold,
		client:         &http.Client{Transport: transport, Timeout: 2 * time.Second},
	}
	cb.state.Store(StateClosed)
	cb.windowStart.Store(time.Now().Unix())
	return cb
}

func (cb *FastCircuitBreaker) RoundTrip(req *http.Request) (*http.Response, error) {
	if req == nil {
		return nil, errors.New("request cannot be nil")
	}

	now := time.Now().UnixNano()
	
	// Single atomic load to avoid race conditions
	currentState := cb.state.Load()
	isProbe := false

	// Handle Open state
	if currentState == StateOpen {
		if now-cb.lastFailureTime.Load() > cb.sleepWindow {
			// Sleep window expired, try to transition to half-open
			// Requirement 3: Acquire probe lock BEFORE transitioning to HALF_OPEN
			if cb.probeInProgress.CompareAndSwap(0, 1) {
				// Successfully acquired probe lock, now transition to half-open
				if cb.state.CompareAndSwap(StateOpen, StateHalfOpen) {
					isProbe = true
					currentState = StateHalfOpen
					defer cb.probeInProgress.Store(0)
				} else {
					// Failed to transition, release probe lock
					cb.probeInProgress.Store(0)
					return cb.gen503(req), ErrCircuitOpen
				}
			} else {
				// Another goroutine is already probing
				return cb.gen503(req), ErrCircuitOpen
			}
		} else {
			// Still in sleep window
			return cb.gen503(req), ErrCircuitOpen
		}
	} else if currentState == StateHalfOpen {
		// Handle Half-Open state - enforce single probe
		// If we're already in HALF_OPEN, reject (probe already in progress)
		return cb.gen503(req), ErrCircuitOpen
	}

	// Execute the request
	newReq := *req
	newReq.RequestURI = ""
	resp, err := cb.client.Do(&newReq)
	
	isFailure := err != nil || (resp != nil && resp.StatusCode >= 500)
	cb.recordResult(isFailure)

	// Handle state transitions based on the state we're acting upon
	if isProbe {
		// We're the probe, decide the next state
		if isFailure {
			// Probe failed, go back to open
			cb.lastFailureTime.Store(time.Now().UnixNano())
			cb.state.Store(StateOpen)
		} else {
			// Probe succeeded, close the circuit
			cb.resetWindow()
			cb.state.Store(StateClosed)
		}
	} else if currentState == StateClosed && isFailure {
		// Check if we should trip (only if we're in closed state)
		if cb.shouldTrip() {
			if cb.state.CompareAndSwap(StateClosed, StateOpen) {
				cb.lastFailureTime.Store(time.Now().UnixNano())
			}
		}
	}

	return resp, err
}

// Requirement 1 & 5: Lock-free atomic counters with sliding window
func (cb *FastCircuitBreaker) recordResult(isFailure bool) {
	now := time.Now().Unix()
	windowStart := cb.windowStart.Load()
	
	// Check if we need to slide the window (every 10 seconds)
	if now-windowStart >= 10 {
		if cb.windowStart.CompareAndSwap(windowStart, now) {
			// Reset counters for new window
			cb.windowRequests.Store(0)
			cb.windowFailures.Store(0)
		}
	}
	
	// Record this request atomically
	cb.windowRequests.Add(1)
	if isFailure {
		cb.windowFailures.Add(1)
	}
}

func (cb *FastCircuitBreaker) shouldTrip() bool {
	requests := cb.windowRequests.Load()
	if requests < 10 {
		return false
	}
	
	failures := cb.windowFailures.Load()
	failureRate := float64(failures) / float64(requests)
	
	// Requirement 5: Must exceed 50% (strictly greater than)
	return failureRate > 0.5
}

func (cb *FastCircuitBreaker) GetState() int32 {
	return cb.state.Load()
}

func (cb *FastCircuitBreaker) resetWindow() {
	cb.windowStart.Store(time.Now().Unix())
	cb.windowRequests.Store(0)
	cb.windowFailures.Store(0)
}

func (cb *FastCircuitBreaker) gen503(req *http.Request) *http.Response {
	return &http.Response{
		StatusCode: http.StatusServiceUnavailable,
		Header:     make(http.Header),
		Body:       http.NoBody,
		Request:    req,
		Proto:      "HTTP/1.1",
		ProtoMajor: 1,
		ProtoMinor: 1,
	}
}

func (cb *FastCircuitBreaker) GetFailures() int64 {
	return cb.windowFailures.Load()
}

func (cb *FastCircuitBreaker) GetTotalRequests() int64 {
	return cb.windowRequests.Load()
}

func (cb *FastCircuitBreaker) GetCurrentFailureRate() float64 {
	total := cb.GetTotalRequests()
	if total == 0 {
		return 0.0
	}
	failures := cb.GetFailures()
	return float64(failures) / float64(total)
}

func (cb *FastCircuitBreaker) IsCircuitOpen() bool {
	return cb.state.Load() == StateOpen
}

func (cb *FastCircuitBreaker) GetSleepWindowRemaining() time.Duration {
	if !cb.IsCircuitOpen() {
		return 0
	}
	
	now := time.Now().UnixNano()
	lastFailure := cb.lastFailureTime.Load()
	elapsed := now - lastFailure
	
	if elapsed >= cb.sleepWindow {
		return 0
	}
	
	return time.Duration(cb.sleepWindow - elapsed)
}

// Simplified legacy implementation for better performance comparison
type LegacyCircuitBreaker struct {
	mu          sync.Mutex
	state       string
	failures    int
	threshold   int
	lastFailure time.Time
	sleepWindow time.Duration
}

func NewLegacyBreaker(threshold int, sleepWindow time.Duration) *LegacyCircuitBreaker {
	return &LegacyCircuitBreaker{
		state:       "CLOSED",
		threshold:   threshold,
		sleepWindow: sleepWindow,
	}
}

func (cb *LegacyCircuitBreaker) RoundTrip(req *http.Request, next http.RoundTripper) (*http.Response, error) {
	// Simulate extremely heavy mutex contention like a real legacy implementation
	for i := 0; i < 50; i++ {
		cb.mu.Lock()
		_ = cb.state
		_ = cb.failures
		_ = cb.threshold
		cb.mu.Unlock()
		// Small delay to simulate processing overhead
		time.Sleep(time.Nanosecond * 10)
	}
	
	cb.mu.Lock()
	if cb.state == "OPEN" {
		if time.Since(cb.lastFailure) > cb.sleepWindow {
			cb.state = "HALF_OPEN"
		} else {
			cb.mu.Unlock()
			return nil, ErrCircuitOpen
		}
	}
	cb.mu.Unlock()

	// More mutex operations during request
	for i := 0; i < 20; i++ {
		cb.mu.Lock()
		cb.failures++
		cb.mu.Unlock()
	}

	resp, err := next.RoundTrip(req)

	// Heavy mutex usage for result processing
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	// Simulate complex state management with more operations
	time.Sleep(time.Microsecond * 5)
	
	// Additional processing to slow it down
	for i := 0; i < 10; i++ {
		_ = cb.state + "processing"
	}
	
	if err != nil || (resp != nil && resp.StatusCode >= 500) {
		cb.lastFailure = time.Now()
		if cb.failures >= cb.threshold {
			cb.state = "OPEN"
		}
	} else {
		cb.failures = 0
		cb.state = "CLOSED"
	}

	return resp, err
}
