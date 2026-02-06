package tests

import (
"testing"

"windowagg"
)

func TestReq05_DeleteOnClosurePreventsOOM(t *testing.T) {
	// Requirement 5: upon closure, the window entry must be delete()'d
	agg, out := newAggForTest(10, 5)

	// Two keys, same window [100,110)
	agg.Ingest(windowagg.Event{Timestamp: 101, Key: "a", Value: 1})
	agg.Ingest(windowagg.Event{Timestamp: 102, Key: "b", Value: 2})

	// Close it
	agg.Ingest(windowagg.Event{Timestamp: 1000, Key: "x", Value: 0})

	_ = drain(out)

	keys, buckets := agg.StateSize()
	if keys != 1 || buckets != 1 {
		t.Fatalf("expected only close-trigger window to remain; got keys=%d buckets=%d", keys, buckets)
	}

	late := agg.Ingest(windowagg.Event{Timestamp: 105, Key: "a", Value: 1})
	if !late {
		t.Fatalf("expected late event for closed window to be dropped")
	}
}
