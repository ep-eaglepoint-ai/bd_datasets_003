package delivery

import (
	"sync"
	"time"
)

type RateLimiter struct {
	mu          sync.Mutex
	requests    map[string][]time.Time
	limit       int
	window      time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

func (rl *RateLimiter) Allow(webhookID string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-rl.window)

	requests := rl.requests[webhookID]
	var validRequests []time.Time
	for _, t := range requests {
		if t.After(windowStart) {
			validRequests = append(validRequests, t)
		}
	}

	if len(validRequests) >= rl.limit {
		rl.requests[webhookID] = validRequests
		return false
	}

	rl.requests[webhookID] = append(validRequests, now)
	return true
}

func (rl *RateLimiter) GetRetryDelay(webhookID string) time.Duration {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	requests := rl.requests[webhookID]
	if len(requests) == 0 {
		return 0
	}

	now := time.Now()
	windowStart := now.Add(-rl.window)

	var validRequests []time.Time
	for _, t := range requests {
		if t.After(windowStart) {
			validRequests = append(validRequests, t)
		}
	}

	if len(validRequests) < rl.limit {
		return 0
	}

	oldestInWindow := validRequests[0]
	for _, t := range validRequests {
		if t.Before(oldestInWindow) {
			oldestInWindow = t
		}
	}

	delay := oldestInWindow.Add(rl.window).Sub(now)
	if delay < 0 {
		return 0
	}

	return delay + time.Millisecond*100
}

func (rl *RateLimiter) GetCurrentCount(webhookID string) int {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-rl.window)

	requests := rl.requests[webhookID]
	count := 0
	for _, t := range requests {
		if t.After(windowStart) {
			count++
		}
	}

	return count
}

func (rl *RateLimiter) Reset(webhookID string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	delete(rl.requests, webhookID)
}

func (rl *RateLimiter) Cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	windowStart := now.Add(-rl.window)

	for webhookID, requests := range rl.requests {
		var validRequests []time.Time
		for _, t := range requests {
			if t.After(windowStart) {
				validRequests = append(validRequests, t)
			}
		}

		if len(validRequests) == 0 {
			delete(rl.requests, webhookID)
		} else {
			rl.requests[webhookID] = validRequests
		}
	}
}
