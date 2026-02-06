package ringbuf_test

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	ringbuf "kw5tnw-concurrent-safe-ring-buffer-test-suite/repository_before"
)

// Minimal interface so the integrity harness can be re-run against a buggy proxy.
type pushPopper interface {
	Push(int) bool
	Pop() (int, bool)
}

func TestSequentialBasics(t *testing.T) {
	rb := ringbuf.NewRingBuffer(4)

	if v, ok := rb.Pop(); ok || v != 0 {
		t.Fatalf("expected empty pop to return (0,false); got (%d,%v)", v, ok)
	}

	// Fill exactly to capacity.
	for i := 1; i <= 4; i++ {
		if ok := rb.Push(i); !ok {
			t.Fatalf("expected Push(%d) to succeed", i)
		}
	}

	// Now full.
	if ok := rb.Push(999); ok {
		t.Fatalf("expected Push to return false when full")
	}

	// Pop must be FIFO.
	for i := 1; i <= 4; i++ {
		v, ok := rb.Pop()
		if !ok {
			t.Fatalf("expected Pop to succeed for item %d", i)
		}
		if v != i {
			t.Fatalf("FIFO violated: expected %d got %d", i, v)
		}
	}

	// Now empty again.
	if v, ok := rb.Pop(); ok || v != 0 {
		t.Fatalf("expected empty pop to return (0,false); got (%d,%v)", v, ok)
	}
}

func TestConcurrentIntegrity(t *testing.T) {
	// N, M >= 10 and total operations >= 1,000,000.
	const (
		producers      = 10
		consumers      = 10
		perProducerOps = 100_000 // total pushes = 1,000,000
		size           = 2048    // force saturation frequently
	)
	if producers < 10 || consumers < 10 {
		t.Fatalf("test misconfigured: producers/consumers must be >= 10")
	}

	rb := ringbuf.NewRingBuffer(size)
	res := runConcurrentIntegrity(t, rb, producers, consumers, perProducerOps)

	if res.saturationCount == 0 {
		t.Fatalf("expected saturationCount > 0 (Push(false) must happen under load); got %d", res.saturationCount)
	}
}

type integrityResult struct {
	saturationCount uint64
}

func runConcurrentIntegrity(t testing.TB, q pushPopper, producers, consumers, perProducerOps int) integrityResult {
	t.Helper()

	// No time.Sleep for sync; timeout is only hang detection.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	total := producers * perProducerOps

	// Balance sheet: each value must be popped exactly once.
	seen := make([]atomic.Uint32, total)

	// Atomic counters keep the harness race-detector clean.
	var pushedCount atomic.Uint64
	var poppedCount atomic.Uint64
	var saturationCount atomic.Uint64

	var prodWG sync.WaitGroup
	prodWG.Add(producers)
	for p := 0; p < producers; p++ {
		p := p
		go func() {
			defer prodWG.Done()
			base := p * perProducerOps
			for i := 0; i < perProducerOps; i++ {
				val := base + i
				for {
					if ctx.Err() != nil {
						return
					}
					if q.Push(val) {
						pushedCount.Add(1)
						break
					}
					// Backpressure: yield and retry until written.
					saturationCount.Add(1)
					runtime.Gosched()
				}
			}
		}()
	}

	var consWG sync.WaitGroup
	consWG.Add(consumers)
	for c := 0; c < consumers; c++ {
		go func() {
			defer consWG.Done()
			for {
				if ctx.Err() != nil {
					return
				}
				cur := poppedCount.Load()
				if int(cur) >= total {
					return
				}
				v, ok := q.Pop()
				if !ok {
					runtime.Gosched()
					continue
				}

				// Defensive check: values must be within the pushed universe.
				if v < 0 || v >= total {
					failNow(t, fmt.Sprintf("popped out-of-range value %d (expected [0,%d))", v, total))
					return
				}

				seen[v].Add(1)
				poppedCount.Add(1)
			}
		}()
	}

	done := make(chan struct{})
	go func() {
		prodWG.Wait()
		consWG.Wait()
		close(done)
	}()

	select {
	case <-done:
		// proceed
	case <-ctx.Done():
		failNow(t, "concurrent integrity test timed out (possible deadlock/liveness failure)")
	}

	if got := int(pushedCount.Load()); got != total {
		failNow(t, fmt.Sprintf("expected pushedCount=%d got %d", total, got))
	}
	if got := int(poppedCount.Load()); got != total {
		failNow(t, fmt.Sprintf("expected poppedCount=%d got %d", total, got))
	}

	for i := 0; i < total; i++ {
		cnt := seen[i].Load()
		if cnt != 1 {
			failNow(t, fmt.Sprintf("value %d seen %d times (expected exactly once)", i, cnt))
		}
	}

	return integrityResult{saturationCount: saturationCount.Load()}
}

func failNow(t testing.TB, msg string) {
	if tt, ok := t.(*testing.T); ok {
		tt.Fatalf("%s", msg)
		return
	}
	if tb, ok := t.(*testing.B); ok {
		tb.Fatalf("%s", msg)
		return
	}
	panic(msg)
}
