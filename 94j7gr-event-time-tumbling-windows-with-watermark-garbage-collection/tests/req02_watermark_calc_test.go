package tests

import (
"testing"

"windowagg"
)

func TestReq02_GlobalWatermarkMaxObservedMinusAllowedLateness(t *testing.T) {
	agg, _ := newAggForTest(10, 7)

	agg.Ingest(windowagg.Event{Timestamp: 100, Key: "k", Value: 1})
	if wm := agg.Watermark(); wm != 93 {
		t.Fatalf("expected watermark=93, got %d", wm)
	}

	agg.Ingest(windowagg.Event{Timestamp: 120, Key: "k", Value: 1})
	if wm := agg.Watermark(); wm != 113 {
		t.Fatalf("expected watermark=113, got %d", wm)
	}
}
