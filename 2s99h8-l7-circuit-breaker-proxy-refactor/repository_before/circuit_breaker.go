// filename: proxy/circuit_breaker.go
package proxy

import (
	"errors"
	"net/http"
	"sync"
	"time"
)

// Import Documentation:
// errors: Used for defining the circuit-open error state.
// net/http: Required for interacting with the RoundTripper interface and HTTP statuses.
// sync: Used in this legacy version for Mutexes (to be replaced with atomic).
// time: Required for tracking the sleep window and rolling timeouts.

var ErrCircuitOpen = errors.New("circuit breaker is open")

// LegacyCircuitBreaker is the current slow implementation.
// It uses a Mutex for every operation, causing high contention.
type LegacyCircuitBreaker struct {
	mu          sync.Mutex
	state       string // "CLOSED", "OPEN", "HALF_OPEN"
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

// Execute wraps an HTTP request. This is the hot path that needs refactoring.
func (cb *LegacyCircuitBreaker) RoundTrip(req *http.Request, next http.RoundTripper) (*http.Response, error) {
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

	resp, err := next.RoundTrip(req)

	cb.mu.Lock()
	defer cb.mu.Unlock()

	if err != nil || (resp != nil && resp.StatusCode >= 500) {
		cb.failures++
		cb.lastFailure = time.Now()
		if cb.failures >= cb.threshold {
			cb.state = "OPEN"
		}
		return resp, err
	}

	// On success, reset
	cb.failures = 0
	cb.state = "CLOSED"
	return resp, nil
}
