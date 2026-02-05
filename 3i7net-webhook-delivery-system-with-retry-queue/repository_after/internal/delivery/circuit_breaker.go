package delivery

import (
	"sync"
	"time"
)

const (
	circuitBreakerThreshold = 5
	circuitBreakerTimeout   = time.Minute
)

type CircuitBreaker struct {
	mu       sync.RWMutex
	failures map[string]int
	openedAt map[string]time.Time
}

func NewCircuitBreaker() *CircuitBreaker {
	return &CircuitBreaker{
		failures: make(map[string]int),
		openedAt: make(map[string]time.Time),
	}
}

func (cb *CircuitBreaker) RecordFailure(webhookID string) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

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

	cb.failures[webhookID] = 0
	delete(cb.openedAt, webhookID)
}

func (cb *CircuitBreaker) IsOpen(webhookID string) bool {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	openedTime, exists := cb.openedAt[webhookID]
	if !exists {
		return false
	}

	if time.Since(openedTime) >= circuitBreakerTimeout {
		return false
	}

	return true
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
}

func (cb *CircuitBreaker) GetFailureCount(webhookID string) int {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	return cb.failures[webhookID]
}

func (cb *CircuitBreaker) GetState(webhookID string) string {
	cb.mu.RLock()
	defer cb.mu.RUnlock()

	openedTime, exists := cb.openedAt[webhookID]
	if !exists {
		return "closed"
	}

	if time.Since(openedTime) >= circuitBreakerTimeout {
		return "half-open"
	}

	return "open"
}
