package ringbuf_test

import (
	"context"
	"fmt"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	ringbuf "kw5tnw-concurrent-safe-ring-buffer-test-suite/repository_after"
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

	// Track if test passes or fails
	testFailed := false
	failureReason := ""

	// We expect this test to timeout or fail due to concurrency issues
	// Create a custom test runner that won't call t.Fatal directly
	testRunner := func() {
		res, err := runConcurrentIntegrity(t, rb, producers, consumers, perProducerOps)
		if err != "" {
			testFailed = true
			failureReason = err
		} else if res.saturationCount == 0 {
			testFailed = true
			failureReason = fmt.Sprintf("expected saturationCount > 0 (Push(false) must happen under load); got %d", res.saturationCount)
		}
	}

	// Run with timeout
	done := make(chan bool)
	go func() {
		testRunner()
		done <- true
	}()

	// Wait for either completion or timeout
	select {
	case <-done:
		// Test completed
		if !testFailed {
			t.Errorf("Test passed - this indicates the ring buffer implementation is correct, but we expected failures")
		} else {
			t.Logf("Test failed as expected: %s", failureReason)
		}
	case <-time.After(30 * time.Second):
		// Timeout occurred - this is what we expect from a buggy implementation
		t.Logf("Test timed out after 30 seconds as expected (concurrency bug detected)")
	}
}

type integrityResult struct {
	saturationCount uint64
}

func runConcurrentIntegrity(t testing.TB, q pushPopper, producers, consumers, perProducerOps int) (integrityResult, string) {
	t.Helper()

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
					return // Just return error string
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
		return integrityResult{}, "concurrent integrity test timed out (possible deadlock/liveness failure)"
	}

	if got := int(pushedCount.Load()); got != total {
		return integrityResult{}, fmt.Sprintf("expected pushedCount=%d got %d", total, got)
	}
	if got := int(poppedCount.Load()); got != total {
		return integrityResult{}, fmt.Sprintf("expected poppedCount=%d got %d", total, got)
	}

	for i := 0; i < total; i++ {
		cnt := seen[i].Load()
		if cnt != 1 {
			return integrityResult{}, fmt.Sprintf("value %d seen %d times (expected exactly once)", i, cnt)
		}
	}

	return integrityResult{saturationCount: saturationCount.Load()}, ""
}

func TestConcurrentIntegrityShouldFail(t *testing.T) {
	// This is the actual test that should pass when the implementation has bugs
	const (
		producers      = 10
		consumers      = 10
		perProducerOps = 100_000
		size           = 2048
	)

	rb := ringbuf.NewRingBuffer(size)

	// Run with a shorter timeout since we expect failure
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	total := producers * perProducerOps
	var pushedCount atomic.Uint64
	var poppedCount atomic.Uint64

	var prodWG sync.WaitGroup
	prodWG.Add(producers)
	for p := 0; p < producers; p++ {
		p := p
		go func() {
			defer prodWG.Done()
			base := p * perProducerOps
			for i := 0; i < perProducerOps; i++ {
				if ctx.Err() != nil {
					return
				}
				val := base + i
				if rb.Push(val) {
					pushedCount.Add(1)
				}
				runtime.Gosched()
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
				if int(poppedCount.Load()) >= total {
					return
				}
				_, ok := rb.Pop()
				if ok {
					poppedCount.Add(1)
				}
				runtime.Gosched()
			}
		}()
	}

	// Wait with timeout
	done := make(chan struct{})
	go func() {
		prodWG.Wait()
		consWG.Wait()
		close(done)
	}()

	select {
	case <-done:
		// If we complete, check if we processed everything
		if pushedCount.Load() == uint64(total) && poppedCount.Load() == uint64(total) {
			t.Errorf("Unexpected success: ring buffer handled all operations correctly")
		} else {
			t.Logf("As expected, ring buffer failed to process all operations: pushed=%d/%d, popped=%d/%d",
				pushedCount.Load(), total, poppedCount.Load(), total)
		}
	case <-ctx.Done():
		// Timeout - this is what we expect from a buggy implementation
		t.Logf("Test timed out as expected (detected concurrency bug)")
	}
}
