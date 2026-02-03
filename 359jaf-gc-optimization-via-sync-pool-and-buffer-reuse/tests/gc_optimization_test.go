package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"sync"
	"testing"
)

func TestAllRequirements(t *testing.T) {

	t.Run("DataIntegrity_NoLeakage", func(t *testing.T) {
		// TEST: Must Reset() to prevent data leakage.
		// We simulate a "dirty" buffer from a previous large session.
		dirtyData := []byte("FORBIDDEN_DATA_FROM_PREVIOUS_SESSION_LEAK")

		// This depends on the pool being accessible. If it's private,
		// we test via sequential calls.
		bid1 := Impl.BidResponse("1", string(dirtyData), 0)
		Impl.SerializeBidResponse(io.Discard, bid1)

		bid2 := Impl.BidResponse("CLEAN", "", 0)
		var out bytes.Buffer
		Impl.SerializeBidResponse(&out, bid2)

		if bytes.Contains(out.Bytes(), dirtyData) {
			t.Errorf("Security Breach: Pooled buffer leaked data between requests")
		}
	})

	t.Run("ValidJSONOutput", func(t *testing.T) {
		// TEST: JSON must remain valid and identical.
		bid := Impl.BidResponse("test-1", "", 0.99)
		var out bytes.Buffer
		Impl.SerializeBidResponse(&out, bid)

		var decoded struct{ ID string }
		_ = json.Unmarshal(out.Bytes(), &decoded)
		if decoded.ID != "test-1" {
			t.Errorf("Data mismatch: expected test-1, got %s", decoded.ID)
		}
	})

	t.Run("ConcurrencySafety", func(t *testing.T) {
		// TEST: Ensure Put is handled correctly under load.
		var wg sync.WaitGroup
		bid := Impl.BidResponse("bench", "", 0)
		for i := 0; i < 100; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_ = Impl.SerializeBidResponse(io.Discard, bid)
			}()
		}
		wg.Wait()
	})
}

func TestCheckAllocationsStrict(t *testing.T) {
	result := testing.Benchmark(func(b *testing.B) {
		bid := Impl.BidResponse("bench", "", 0)
		for i := 0; i < b.N; i++ {
			_ = Impl.SerializeBidResponse(io.Discard, bid)
		}
	})

	// Fail the test if we exceed 1 allocation
	if result.AllocsPerOp() > 1 {
		t.Errorf("Performance Regression: Expected <= 1 alloc/op, got %d", result.AllocsPerOp())
	}
}
