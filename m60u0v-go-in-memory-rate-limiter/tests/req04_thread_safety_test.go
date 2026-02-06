package tests

import (
	"limiter"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestReq04_ThreadSafety_ConcurrentAllow_SameClientCapped(t *testing.T) {
	// Run with: go test -race
	g := limiter.NewSpamGuard(10, 5*time.Second)

	var allowed int64
	const goroutines = 64

	start := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		go func() {
			defer wg.Done()
			<-start
			if g.Allow("same-client") {
				atomic.AddInt64(&allowed, 1)
			}
		}()
	}

	close(start)
	wg.Wait()

	if got := atomic.LoadInt64(&allowed); got > 10 {
		t.Fatalf("allowed=%d exceeds maxReqs=10", got)
	}
}

func TestReq04_ThreadSafety_ConcurrentAllow_ManyClientsNoCorruption(t *testing.T) {
	// Primary goal: race detector + map safety under concurrent access.
	g := limiter.NewSpamGuard(5, 2*time.Second)

	const goroutines = 128
	const perG = 50

	var wg sync.WaitGroup
	wg.Add(goroutines)

	for i := 0; i < goroutines; i++ {
		clientID := "c" + string(rune('A'+(i%26)))
		go func(id string) {
			defer wg.Done()
			for j := 0; j < perG; j++ {
				_ = g.Allow(id)
			}
		}(clientID)
	}

	wg.Wait()
}
