package main

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

type cacheItem struct {
	value      interface{}
	lastAccess time.Time
}

type RateLimitedLRUCache struct {
	capacity int
	interval time.Duration
	cache    map[string]*cacheItem
	order    []string
	mu       sync.Mutex
	lastGet  map[string]time.Time
}

func NewCache(cap int, interval time.Duration) *RateLimitedLRUCache {
	return &RateLimitedLRUCache{
		capacity: cap,
		interval: interval,
		cache:    make(map[string]*cacheItem),
		order:    []string{},
		lastGet:  make(map[string]time.Time),
	}
}

// Set adds or updates a key in the cache
func (c *RateLimitedLRUCache) Set(key string, value interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.cache[key]; !exists && len(c.order) >= c.capacity {
		// Evict LRU
		lru := c.order[0]
		c.order = c.order[1:]
		delete(c.cache, lru)
		delete(c.lastGet, lru)
	}

	if _, exists := c.cache[key]; !exists {
		c.order = append(c.order, key)
	}

	c.cache[key] = &cacheItem{value: value, lastAccess: time.Now()}
}

// Get returns a value if it exists and respects the rate limit
func (c *RateLimitedLRUCache) Get(key string) (interface{}, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	item, exists := c.cache[key]
	if !exists {
		return nil, errors.New("key not found")
	}

	// Check rate limiting
	now := time.Now()
	if last, ok := c.lastGet[key]; ok && now.Sub(last) < c.interval {
		return nil, errors.New("rate limit exceeded")
	}

	c.lastGet[key] = now
	item.lastAccess = now

	// Move to end of order (most recently used)
	c.moveToEnd(key)

	return item.value, nil
}

// moveToEnd updates the order slice to mark key as most recently used
func (c *RateLimitedLRUCache) moveToEnd(key string) {
	for i, k := range c.order {
		if k == key {
			c.order = append(c.order[:i], c.order[i+1:]...)
			c.order = append(c.order, key)
			return
		}
	}
}

// PrintCache prints keys in LRU order (for debugging)
func (c *RateLimitedLRUCache) PrintCache() {
	c.mu.Lock()
	defer c.mu.Unlock()
	fmt.Println("Cache order:", c.order)
}

func main() {
	cache := NewCache(3, 2*time.Second)
	cache.Set("a", 1)
	cache.Set("b", 2)
	cache.Set("c", 3)

	val, err := cache.Get("a")
	fmt.Println(val, err)

	cache.Set("d", 4) // Evicts "b"
	cache.PrintCache()
}
