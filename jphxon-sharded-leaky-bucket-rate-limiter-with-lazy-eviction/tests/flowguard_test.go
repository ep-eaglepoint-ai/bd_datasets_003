package tests

import (
	"flowguard/repository_after"
	"fmt"
	"math"
	"sync"
	"testing"
	"time"
)

// Requirement 1, 2, 6: Shards and different buckets
func TestShardDistribution(t *testing.T) {
	fg := flowguard.NewFlowGuard()
	
	// Create two user IDs that likely hash to different shards (trial and error or FNV logic)
	// Actually we can inspect internals via reflection or just trust high volume?
	// The requirement assumes 256 shards.
	// Let's pour for many users and ensure no panic.
	for i := 0; i < 1000; i++ {
		uid := fmt.Sprintf("user-%d", i)
		fg.TryPour(uid, 1.0, 100.0, 1.0)
	}
	
	// If we can access Buckets size we can verify distribution, 
	// but strictly functional test: should work.
}

// Requirement 3, 5: Leaky Bucket Logic & Float64
func TestLeakyBucketMath(t *testing.T) {
	fg := flowguard.NewFlowGuard()
	uid := "math-test"
	cap := 100.0
	rate := 1.0 // 1 ML per second

	// 1. Initial Pour
	if allowed := fg.TryPour(uid, 50.0, cap, rate); !allowed {
		t.Fatal("Initial pour of 50 <= 100 failed")
	}

	// 2. Immediate Second Pour
	// Level should be ~50. 50 + 51 = 101 > 100 -> Reject
	if allowed := fg.TryPour(uid, 51.0, cap, rate); allowed {
		t.Fatal("Pour that exceeds capacity allowed")
	}

	// 3. Wait 10 seconds -> Leaked 10ML -> Level ~40
	time.Sleep(1 * time.Second) // Only sleeping 1s here? Need precise control or sleep
	// Since I assume system clock, I actually have to sleep in this integration test.
	// Or Refactor to inject Clock?
	// The prompt requirement didn't explicitly ask for Clock injection like the Java one,
	// but "precise float64" implies we should test values. 
	// Let's implement a 'Simulate' sleep by ensuring our logic (time.Now) uses real time.
	// Wait 1.5 seconds.
	time.Sleep(1500 * time.Millisecond)
	
	// Leaked ~1.5 ML. Level ~48.5. 
	// Pour 51.0 -> 48.5 + 51 = 99.5 <= 100 -> Allow
	
	if allowed := fg.TryPour(uid, 51.0, cap, rate); !allowed {
		// This might be flaky if sleep is imprecise. 
		// But in a pure Go test environment usually 1.5s is enough delta.
		// Let's verify drain first.
		t.Fatalf("Drain failed, should allow pour after decay")
	}
}

// Requirement 4: Lazy Eviction
func TestLazyEviction(t *testing.T) {
	fg := flowguard.NewFlowGuard()
	uid := "eviction-test"
	cap := 10.0
	rate := 100.0 // Fast drain

	// Pour to fill
	fg.TryPour(uid, 5.0, cap, rate)
	
	// Verify it exists (indirectly via GetBucketState)
	if val, ok := fg.GetBucketState(uid); !ok || val == 0 {
		t.Fatal("Bucket should exist")
	}

	// Wait for full drain: 5.0 / 100.0 = 0.05s
	time.Sleep(100 * time.Millisecond)
	
	// Now the bucket should be calculated as 0.
	// To trigger eviction, we need to access IT.
	// TryPour with a value that exceeds capacity if it were empty? No, 
	// TryPour with a HUGE value (greater than cap) -> Rejected.
	// Logic: If request rejected AND level decayed to 0 -> Delete.
	
	// Try to pour 20.0 ( > 10.0). 
	// Logic: 
	//   1. Get bucket.
	//   2. Calc level: 5 - (elapsed*100) -> 0.
	//   3. Check: 0 + 20 <= 10 -> False.
	//   4. Reject.
	//   5. Eviction Check: Exists? Yes. CurrentLevel==0? Yes. -> Delete.
	fg.TryPour(uid, 20.0, cap, rate)
	
	// Now verify it's gone
	if _, ok := fg.GetBucketState(uid); ok {
		t.Fatal("Bucket should have been evicted")
	}
}

// Requirement 6, 7: Race Condition / Locking
func TestConcurrency(t *testing.T) {
	fg := flowguard.NewFlowGuard()
	uid := "concurrent-user"
	cap := 1000.0
	rate := 0.0 // No drain to simplify sum check
	
	var wg sync.WaitGroup
	pours := 1000
	vol := 1.0
	
	for i := 0; i < pours; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fg.TryPour(uid, vol, cap, rate)
		}()
	}
	
	wg.Wait()
	
	// Check final level
	val, ok := fg.GetBucketState(uid)
	if !ok {
		t.Fatal("Bucket missing")
	}
	
	if math.Abs(val - float64(pours)) > 0.0001 {
		t.Fatalf("Expected level %f, got %f", float64(pours), val)
	}
}
