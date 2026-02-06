package tests

import (
"testing"

"windowagg"
)

func TestReq10_WatermarkMonotonicOldEventsDoNotDecrease(t *testing.T) {
	agg, _ := newAggForTest(10, 5)

	agg.Ingest(windowagg.Event{Timestamp: 200, Key: "k", Value: 1})
	wm1 := agg.Watermark()

	// Old event arrives; watermark must NOT decrease.
	agg.Ingest(windowagg.Event{Timestamp: 50, Key: "k", Value: 1})
	wm2 := agg.Watermark()

	if wm2 != wm1 {
		t.Fatalf("watermark must be monotonic: before=%d after=%d", wm1, wm2)
	}
}
