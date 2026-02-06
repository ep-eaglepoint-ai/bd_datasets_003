package tests

import (
"testing"

"windowagg"
)

func TestReq03_WindowClosedOnlyWhenWatermarkStrictlyGreaterThanEnd(t *testing.T) {
	// Requirement 3: close only when GlobalWatermark > End (strict)
	agg, out := newAggForTest(10, 5)

	// Window [100,110)
	agg.Ingest(windowagg.Event{Timestamp: 101, Key: "k", Value: 1})

	// Make watermark == 110 exactly (NOT closed)
	// maxObserved=115 => wm=115-5=110
	agg.Ingest(windowagg.Event{Timestamp: 115, Key: "x", Value: 0})

	if got := drain(out); len(got) != 0 {
		t.Fatalf("expected no emission when watermark==end, got %#v", got)
	}

	// Now watermark becomes 111 (>110): close should happen
	// maxObserved=116 => wm=111
	agg.Ingest(windowagg.Event{Timestamp: 116, Key: "x", Value: 0})

	got := drain(out)
	if len(got) != 1 {
		t.Fatalf("expected 1 emission after wm>end, got %d: %#v", len(got), got)
	}
	if got[0].windowStart != 100 || got[0].windowEnd != 110 {
		t.Fatalf("expected [100,110), got [%d,%d)", got[0].windowStart, got[0].windowEnd)
	}
}
