package model

import (
	"sync"
	"time"
)

type ReserveRequest struct {
	ResourceID string `json:"resource_id"`
	Quantity   int    `json:"quantity"`
}

type Inventory struct {
	Mu    sync.Mutex
	Items map[string]int
}

type RateLimiter struct {
	Mu        sync.Mutex
	Count     int
	LastReset time.Time
	Limit     int
}

func NewRateLimiter(limit int) *RateLimiter {
	return &RateLimiter{
		Limit:     limit,
		LastReset: time.Now(),
	}
}

func (r *RateLimiter) Allow() bool {
	r.Mu.Lock()
	defer r.Mu.Unlock()

	now := time.Now()
	if now.Sub(r.LastReset) >= time.Second {
		r.Count = 0
		r.LastReset = now
	}

	if r.Count >= r.Limit {
		return false
	}

	r.Count++
	return true
}
