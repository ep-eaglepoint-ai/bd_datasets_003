package tests

import (
"testing"

"windowagg"
)

func TestReq08_MultipleKeysNoCrossContamination(t *testing.T) {
	agg, out := newAggForTest(10, 5)

	// Same window, different keys
	agg.Ingest(windowagg.Event{Timestamp: 101, Key: "a", Value: 1.5})
	agg.Ingest(windowagg.Event{Timestamp: 102, Key: "b", Value: 2.5})
	agg.Ingest(windowagg.Event{Timestamp: 103, Key: "a", Value: 1.0})

	// Close
	agg.Ingest(windowagg.Event{Timestamp: 1000, Key: "x", Value: 0})

	got := drain(out)
	if len(got) != 2 {
		t.Fatalf("expected 2 emissions (one per key), got %d: %#v", len(got), got)
	}

	byKey := map[string]float64{}
	for _, e := range got {
		byKey[e.key] = e.sum
		if e.windowStart != 100 || e.windowEnd != 110 {
			t.Fatalf("unexpected window for %s: [%d,%d)", e.key, e.windowStart, e.windowEnd)
		}
	}
	if byKey["a"] != 2.5 {
		t.Fatalf("expected key a sum=2.5, got %v", byKey["a"])
	}
	if byKey["b"] != 2.5 {
		t.Fatalf("expected key b sum=2.5, got %v", byKey["b"])
	}
}
