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
	
	// Sliding Window Counter approach (Requirement 5: true rolling window)
	// Divide 10-second window into 20 buckets of 500ms each
	// This provides O(1) operations while maintaining smooth rolling window semantics
	buckets         [20]bucket        // 20 buckets for 10-second window (500ms each)
	currentBucket   atomic.Int64      // Current bucket index (0-19)
	lastBucketTime  atomic.Int64      // Timestamp of last bucket rotation
	
	// Single probe enforcement
	probeInProgress atomic.Int32
	
	client          *http.Client
}

// bucket represents a 1-second time slice in the rolling window
type bucket struct {
	requests atomic.Int64  // Total requests in this bucket
	failures atomic.Int64  // Failed requests in this bucket
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
	cb.currentBucket.Store(0)
	cb.lastBucketTime.Store(time.Now().UnixNano())
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

// Requirement 1 & 5: Lock-free atomic counters with TRUE rolling window
// Uses Sliding Window Counter approach: O(1) operations with rolling semantics
func (cb *FastCircuitBreaker) recordResult(isFailure bool) {
	now := time.Now().UnixNano()
	
	// Always rotate buckets based on elapsed time to maintain true rolling window
	cb.rotateBucketsIfNeededInternal(now)
	
	// Record in current bucket (lock-free, always succeeds)
	idx := cb.currentBucket.Load()
	cb.buckets[idx].requests.Add(1)
	if isFailure {
		cb.buckets[idx].failures.Add(1)
	}
}

// rotateBucketsIfNeededInternal performs bucket rotation with timestamp
func (cb *FastCircuitBreaker) rotateBucketsIfNeededInternal(now int64) {
	lastRotation := cb.lastBucketTime.Load()
	elapsed := now - lastRotation
	bucketDuration := int64(500 * time.Millisecond) // 500ms per bucket
	
	// Only attempt rotation if we've crossed a bucket boundary
	if elapsed >= bucketDuration {
		bucketsToRotate := elapsed / bucketDuration
		if bucketsToRotate > 20 {
			bucketsToRotate = 20
		}
		
		// Try to acquire rotation lock (non-blocking)
		if cb.lastBucketTime.CompareAndSwap(lastRotation, now) {
			currentIdx := cb.currentBucket.Load()
			
			// Rotate buckets - clear old buckets as we advance
			for i := int64(0); i < bucketsToRotate; i++ {
				currentIdx = (currentIdx + 1) % 20
				cb.buckets[currentIdx].requests.Store(0)
				cb.buckets[currentIdx].failures.Store(0)
			}
			
			cb.currentBucket.Store(currentIdx)
		}
	}
}

func (cb *FastCircuitBreaker) shouldTrip() bool {
	// Ensure buckets are rotated before reading to maintain true rolling window
	now := time.Now().UnixNano()
	cb.rotateBucketsIfNeededInternal(now)
	
	// Sum across all buckets - O(20) = O(1) constant time
	var totalRequests int64
	var totalFailures int64
	
	for i := 0; i < 20; i++ {
		totalRequests += cb.buckets[i].requests.Load()
		totalFailures += cb.buckets[i].failures.Load()
	}
	
	// Need at least 10 requests to make a decision
	if totalRequests < 10 {
		return false
	}
	
	failureRate := float64(totalFailures) / float64(totalRequests)
	
	// Requirement 5: Must exceed 50% (strictly greater than)
	return failureRate > cb.errorThreshold
}

func (cb *FastCircuitBreaker) GetState() int32 {
	return cb.state.Load()
}

func (cb *FastCircuitBreaker) resetWindow() {
	// Clear all buckets
	for i := 0; i < 20; i++ {
		cb.buckets[i].requests.Store(0)
		cb.buckets[i].failures.Store(0)
	}
	cb.currentBucket.Store(0)
	cb.lastBucketTime.Store(time.Now().UnixNano())
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
	// Trigger bucket rotation if needed before reading
	now := time.Now().UnixNano()
	cb.rotateBucketsIfNeededInternal(now)
	
	// Sum failures across all buckets - O(1) constant time
	var total int64
	for i := 0; i < 20; i++ {
		total += cb.buckets[i].failures.Load()
	}
	return total
}

func (cb *FastCircuitBreaker) GetTotalRequests() int64 {
	// Trigger bucket rotation if needed before reading
	now := time.Now().UnixNano()
	cb.rotateBucketsIfNeededInternal(now)
	
	// Sum requests across all buckets - O(1) constant time
	var total int64
	for i := 0; i < 20; i++ {
		total += cb.buckets[i].requests.Load()
	}
	return total
}

// rotateBucketsIfNeeded ensures buckets are rotated based on elapsed time
func (cb *FastCircuitBreaker) rotateBucketsIfNeeded() {
	now := time.Now().UnixNano()
	cb.rotateBucketsIfNeededInternal(now)
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
	requests    int
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
	// Realistic mutex contention - check state before request
	cb.mu.Lock()
	if cb.state == "OPEN" {
		if time.Since(cb.lastFailure) > cb.sleepWindow {
			cb.state = "HALF_OPEN"
		} else {
			cb.mu.Unlock()
			return nil, ErrCircuitOpen
		}
	}
	currentState := cb.state
	cb.mu.Unlock()

	// Execute request
	resp, err := next.RoundTrip(req)

	// Update state with mutex - this is the hot path bottleneck
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	cb.requests++
	isFailure := err != nil || (resp != nil && resp.StatusCode >= 500)
	
	if isFailure {
		cb.failures++
		cb.lastFailure = time.Now()
		
		// Simple threshold check (for legacy test compatibility)
		if cb.failures >= cb.threshold {
			cb.state = "OPEN"
		}
		
		// Also check rolling window logic if we have enough requests
		if cb.requests >= 10 {
			failureRate := float64(cb.failures) / float64(cb.requests)
			if failureRate > 0.5 {
				cb.state = "OPEN"
			}
		}
	} else if currentState == "HALF_OPEN" {
		// Successful probe, close circuit
		cb.state = "CLOSED"
		cb.failures = 0
		cb.requests = 0
	}

	return resp, err
}
