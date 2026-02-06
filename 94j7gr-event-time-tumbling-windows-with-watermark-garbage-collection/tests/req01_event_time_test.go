package tests

import (
"testing"

"windowagg"
)

func TestReq01_EventTimeBucketingNotProcessingTime(t *testing.T) {
	// Requirement 1: windows defined by event time (timestamp)
	agg, out := newAggForTest(10, 5)

	// Two events arrive in reverse order (out-of-order arrival).
	// Both belong to the same [100,110) window based on event time.
	late := agg.Ingest(windowagg.Event{Timestamp: 105, Key: "k", Value: 1})
	if late {
		t.Fatalf("unexpected late event")
	}
	late = agg.Ingest(windowagg.Event{Timestamp: 101, Key: "k", Value: 2})
	if late {
		t.Fatalf("unexpected late event")
	}

	// Advance watermark enough to close [100,110): window closes only when wm > 110.
	// maxObserved=200 => wm=200-5=195 > 110 => closes
	agg.Ingest(windowagg.Event{Timestamp: 200, Key: "x", Value: 0})

	got := drain(out)
	if len(got) != 1 {
		t.Fatalf("expected 1 emission, got %d: %#v", len(got), got)
	}
	if got[0].windowStart != 100 || got[0].windowEnd != 110 {
		t.Fatalf("expected window [100,110), got [%d,%d)", got[0].windowStart, got[0].windowEnd)
	}
	if got[0].sum != 3 {
		t.Fatalf("expected sum=3, got %v", got[0].sum)
	}
}
