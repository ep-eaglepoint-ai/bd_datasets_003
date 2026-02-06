package tests

import (
"testing"

"windowagg"
)

func TestReq09_EmitImmediatelyOnClosure(t *testing.T) {
	agg, out := newAggForTest(10, 5)

	agg.Ingest(windowagg.Event{Timestamp: 101, Key: "k", Value: 1})

	// Trigger closure
	agg.Ingest(windowagg.Event{Timestamp: 1000, Key: "x", Value: 0})

	got := drain(out)
	if len(got) != 1 {
		t.Fatalf("expected immediate emission on closure, got %d", len(got))
	}
}
