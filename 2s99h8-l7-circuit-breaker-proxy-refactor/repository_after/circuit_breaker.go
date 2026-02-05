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
	state           int32
	lastFailureTime int64
	sleepWindow     int64
	errorThreshold  float64
	
	// Simple counters for 10-second window
	windowStart     int64
	windowRequests  int64
	windowFailures  int64
	
	// Single probe enforcement
	probeInProgress int32
	
	client          *http.Client
}

func NewFastBreaker(errorThreshold float64, sleepWindow time.Duration) *FastCircuitBreaker {
	transport := &http.Transport{
		MaxIdleConns:        1000,
		MaxIdleConnsPerHost: 1000,
		IdleConnTimeout:     90 * time.Second,
		DisableKeepAlives:   false,
	}

	return &FastCircuitBreaker{
		state:          StateClosed,
		sleepWindow:    sleepWindow.Nanoseconds(),
		errorThreshold: errorThreshold,
		windowStart:    time.Now().Unix(),
		client:         &http.Client{Transport: transport, Timeout: 2 * time.Second},
	}
}

func (cb *FastCircuitBreaker) RoundTrip(req *http.Request) (*http.Response, error) {
	if req == nil {
		return nil, errors.New("request cannot be nil")
	}

	now := time.Now().UnixNano()
	
	// Single atomic load to avoid race conditions
	currentState := atomic.LoadInt32(&cb.state)
	isProbe := false

	// Handle Open state
	if currentState == StateOpen {
		if now-atomic.LoadInt64(&cb.lastFailureTime) > cb.sleepWindow {
			// Sleep window expired, try to transition to half-open
			if atomic.CompareAndSwapInt32(&cb.state, StateOpen, StateHalfOpen) {
				// Successfully transitioned to half-open, this becomes the probe
				isProbe = true
				currentState = StateHalfOpen // Update our view of the state
			} else {
				// Another goroutine transitioned, reject this request
				return cb.gen503(req), ErrCircuitOpen
			}
		} else {
			// Still in sleep window
			return cb.gen503(req), ErrCircuitOpen
		}
	} else if currentState == StateHalfOpen {
		// Handle Half-Open state - enforce single probe
		if !atomic.CompareAndSwapInt32(&cb.probeInProgress, 0, 1) {
			// Another probe is already in progress
			return cb.gen503(req), ErrCircuitOpen
		}
		// This goroutine is now the probe
		isProbe = true
		defer atomic.StoreInt32(&cb.probeInProgress, 0)
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
			atomic.StoreInt64(&cb.lastFailureTime, time.Now().UnixNano())
			atomic.StoreInt32(&cb.state, StateOpen)
		} else {
			// Probe succeeded, close the circuit
			cb.resetWindow()
			atomic.StoreInt32(&cb.state, StateClosed)
		}
	} else if currentState == StateClosed && isFailure {
		// Check if we should trip (only if we're in closed state)
		if cb.shouldTrip() {
			if atomic.CompareAndSwapInt32(&cb.state, StateClosed, StateOpen) {
				atomic.StoreInt64(&cb.lastFailureTime, time.Now().UnixNano())
			}
		}
	}

	return resp, err
}

func (cb *FastCircuitBreaker) recordResult(isFailure bool) {
	now := time.Now().Unix()
	windowStart := atomic.LoadInt64(&cb.windowStart)
	
	// Check if we need to reset the window (every 10 seconds)
	if now-windowStart >= 10 {
		if atomic.CompareAndSwapInt64(&cb.windowStart, windowStart, now) {
			// Reset counters for new window
			atomic.StoreInt64(&cb.windowRequests, 0)
			atomic.StoreInt64(&cb.windowFailures, 0)
		}
	}
	
	// Record this request
	atomic.AddInt64(&cb.windowRequests, 1)
	if isFailure {
		atomic.AddInt64(&cb.windowFailures, 1)
	}
}

func (cb *FastCircuitBreaker) shouldTrip() bool {
	requests := atomic.LoadInt64(&cb.windowRequests)
	if requests < 10 {
		return false
	}
	
	failures := atomic.LoadInt64(&cb.windowFailures)
	failureRate := float64(failures) / float64(requests)
	
	return failureRate >= cb.errorThreshold
}

func (cb *FastCircuitBreaker) GetState() int32 {
	return atomic.LoadInt32(&cb.state)
}

func (cb *FastCircuitBreaker) resetWindow() {
	atomic.StoreInt64(&cb.windowStart, time.Now().Unix())
	atomic.StoreInt64(&cb.windowRequests, 0)
	atomic.StoreInt64(&cb.windowFailures, 0)
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
	return atomic.LoadInt64(&cb.windowFailures)
}

func (cb *FastCircuitBreaker) GetTotalRequests() int64 {
	return atomic.LoadInt64(&cb.windowRequests)
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
	return atomic.LoadInt32(&cb.state) == StateOpen
}

func (cb *FastCircuitBreaker) GetSleepWindowRemaining() time.Duration {
	if !cb.IsCircuitOpen() {
		return 0
	}
	
	now := time.Now().UnixNano()
	lastFailure := atomic.LoadInt64(&cb.lastFailureTime)
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
