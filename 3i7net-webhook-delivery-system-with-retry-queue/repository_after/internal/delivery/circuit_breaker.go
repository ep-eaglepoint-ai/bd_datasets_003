package delivery

import (
	"sync"
	"time"
)

const (
	circuitBreakerThreshold = 5
	circuitBreakerTimeout   = time.Minute
)

// CircuitState represents the state of the circuit breaker
type CircuitState string

const (
	CircuitClosed   CircuitState = "closed"
	CircuitOpen     CircuitState = "open"
	CircuitHalfOpen CircuitState = "half-open"
)

type CircuitBreaker struct {
	mu            sync.RWMutex
	failures      map[string]int
	openedAt      map[string]time.Time
	probeInFlight map[string]bool // Track if a probe request is in progress
}

func NewCircuitBreaker() *CircuitBreaker {
	return &CircuitBreaker{
		failures:      make(map[string]int),
		openedAt:      make(map[string]time.Time),
		probeInFlight: make(map[string]bool),
	}
}

func (cb *CircuitBreaker) RecordFailure(webhookID string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	// If this was a probe request failure, reopen the circuit
	if cb.probeInFlight[webhookID] {
		cb.probeInFlight[webhookID] = false
		cb.openedAt[webhookID] = time.Now() // Reset the timeout for another minute
		return
	}

	cb.failures[webhookID]++

	if cb.failures[webhookID] >= circuitBreakerThreshold {
		if _, exists := cb.openedAt[webhookID]; !exists {
			cb.openedAt[webhookID] = time.Now()
		}
	}
}

func (cb *CircuitBreaker) RecordSuccess(webhookID string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	// If this was a probe request success, fully close the circuit
	if cb.probeInFlight[webhookID] {
		cb.probeInFlight[webhookID] = false
	}

	cb.failures[webhookID] = 0
	delete(cb.openedAt, webhookID)
}

// IsOpen returns true if the circuit is open (blocking requests).
// Returns false if circuit is closed or half-open (allowing probe).
func (cb *CircuitBreaker) IsOpen(webhookID string) bool {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	openedTime, exists := cb.openedAt[webhookID]
	if !exists {
		return false
	}

	// If timeout has elapsed, we're in half-open state - allow probe
	if time.Since(openedTime) >= circuitBreakerTimeout {
		return false
	}

	return true
}

// AllowRequest checks if a request should be allowed and marks probe requests.
// Returns (allowed, isProbe) - if isProbe is true, this is a test request.
func (cb *CircuitBreaker) AllowRequest(webhookID string) (bool, bool) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	openedTime, exists := cb.openedAt[webhookID]
	if !exists {
		return true, false // Circuit closed, normal request
	}

	// Circuit is open - check if we should allow a probe
	if time.Since(openedTime) >= circuitBreakerTimeout {
		// Half-open state: allow one probe request
		if !cb.probeInFlight[webhookID] {
			cb.probeInFlight[webhookID] = true
			return true, true // Allow as probe request
		}
		// Another probe is already in flight, block this request
		return false, false
	}

	return false, false // Circuit open, block request
}

// IsProbeInFlight returns true if a probe request is currently being tested
func (cb *CircuitBreaker) IsProbeInFlight(webhookID string) bool {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.probeInFlight[webhookID]
}

func (cb *CircuitBreaker) GetResetDelay(webhookID string) time.Duration {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	openedTime, exists := cb.openedAt[webhookID]
	if !exists {
		return 0
	}

	elapsed := time.Since(openedTime)
	if elapsed >= circuitBreakerTimeout {
		return 0
	}

	return circuitBreakerTimeout - elapsed
}

func (cb *CircuitBreaker) Reset(webhookID string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.failures[webhookID] = 0
	delete(cb.openedAt, webhookID)
	delete(cb.probeInFlight, webhookID)
}

func (cb *CircuitBreaker) GetFailureCount(webhookID string) int {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	return cb.failures[webhookID]
}

func (cb *CircuitBreaker) GetState(webhookID string) CircuitState {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	openedTime, exists := cb.openedAt[webhookID]
	if !exists {
		return CircuitClosed
	}

	if time.Since(openedTime) >= circuitBreakerTimeout {
		return CircuitHalfOpen
	}

	return CircuitOpen
}
