package tests

import (
"testing"

"windowagg"
)

func TestReq07_LateEventsDroppedAfterClosure(t *testing.T) {
	// Requirement 7: late events after finalization are dropped
	agg, out := newAggForTest(10, 5)

	// Add to window [100,110)
	agg.Ingest(windowagg.Event{Timestamp: 101, Key: "k", Value: 1})

	// Close it (wm >> 110)
	agg.Ingest(windowagg.Event{Timestamp: 1000, Key: "x", Value: 0})
	_ = drain(out)

	// Now an event for that already-closed window arrives
	late := agg.Ingest(windowagg.Event{Timestamp: 105, Key: "k", Value: 10})
	if !late {
		t.Fatalf("expected late=true for event in closed window")
	}

	// Ensure it did not re-open or emit anything extra
	if got := drain(out); len(got) != 0 {
		t.Fatalf("expected no new emissions from late event; got %#v", got)
	}
}
