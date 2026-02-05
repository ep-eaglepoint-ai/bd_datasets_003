package limiter

import "time"

type RateLimiter struct {
	maxTokens int
	tokens    int
	lastRefill time.Time
	refillRate time.Duration
	nowFn     func() time.Time
}

func New(maxTokens int, refillRate time.Duration, nowFn func() time.Time) *RateLimiter {
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
		tokensToAdd := int(elapsed / r.refillRate)
		r.tokens = r.maxTokens
		r.lastRefill = now
	} else {
		// Partial refill calculation
		partialTokens := int(float64(r.maxTokens) * float64(elapsed) / float64(r.refillRate))
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
