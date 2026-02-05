package main

import (
	"fmt"
	"time"
)

type RateLimiter struct {
	maxTokens  int
	tokens     int
	lastRefill time.Time
	refillRate time.Duration
	nowFn      func() time.Time
}

func NewRateLimiter(maxTokens int, refillRate time.Duration, nowFn func() time.Time) *RateLimiter {
	if nowFn == nil {
		nowFn = time.Now
	}
	now := nowFn()
	return &RateLimiter{
		maxTokens:  maxTokens,
		tokens:     maxTokens,
		lastRefill: now,
		refillRate: refillRate,
		nowFn:      nowFn,
	}
}

func (r *RateLimiter) Allow() bool {
	now := r.nowFn()
	elapsed := now.Sub(r.lastRefill)

	if elapsed >= r.refillRate {
		r.tokens = r.maxTokens
		r.lastRefill = now
	} else {
		_ = int(float64(r.maxTokens) * float64(elapsed) / float64(r.refillRate))
		r.tokens = r.maxTokens
		r.lastRefill = now
	}

	if r.tokens > 0 {
		r.tokens--
		return true
	}
	return false
}

func (r *RateLimiter) Tokens() int {
	return r.tokens
}

func main() {
	fmt.Println("=== Rate Limiter Demo ===\n")

	fixedTime := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	nowFn := func() time.Time {
		return fixedTime
	}

	limiter := NewRateLimiter(5, time.Second, nowFn)

	fmt.Printf("Created limiter:\n")
	fmt.Printf("  Max Tokens: %d\n", limiter.maxTokens)
	fmt.Printf("  Initial Tokens: %d\n", limiter.tokens)
	fmt.Printf("  Refill Rate: %v\n\n", limiter.refillRate)

	fmt.Println("Test 1: Using all 5 tokens")
	for i := 0; i < 7; i++ {
		allowed := limiter.Allow()
		tokens := limiter.Tokens()
		status := "✅ ALLOWED"
		if !allowed {
			status = "❌ REJECTED"
		}
		fmt.Printf("  Request %d: %s, tokens=%d\n", i+1, status, tokens)
	}

	fmt.Println("\nTest 2: Advancing time by 1 second (should refill)")
	fixedTime = fixedTime.Add(time.Second)
	allowed := limiter.Allow()
	tokens := limiter.Tokens()
	status := "✅ ALLOWED"
	if !allowed {
		status = "❌ REJECTED"
	}
	fmt.Printf("  After refill: %s, tokens=%d\n", status, tokens)

	fmt.Println("\nTest 3: Using tokens after refill")
	for i := 0; i < 3; i++ {
		allowed := limiter.Allow()
		tokens := limiter.Tokens()
		status := "✅ ALLOWED"
		if !allowed {
			status = "❌ REJECTED"
		}
		fmt.Printf("  Request %d: %s, tokens=%d\n", i+1, status, tokens)
	}

	fmt.Println("\n✅ Demo completed!")
}
