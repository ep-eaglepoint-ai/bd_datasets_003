package tests

import (
"sync"
"testing"

"windowagg"
)

func TestAdditional_OutOfOrderWithinAllowedLatenessAccepted(t *testing.T) {
	agg, out := newAggForTest(10, 5)

	// Newer first
	agg.Ingest(windowagg.Event{Timestamp: 109, Key: "k", Value: 1})

	// Advance maxObserved a bit, but not enough to close [100,110)
	// maxObserved=112 => wm=107 (still not >110)
	agg.Ingest(windowagg.Event{Timestamp: 112, Key: "x", Value: 0})

	// Older event in same window arrives late-ish but within allowed lateness in terms of watermark
	late := agg.Ingest(windowagg.Event{Timestamp: 101, Key: "k", Value: 2})
	if late {
		t.Fatalf("event should not be considered late before window is closed")
	}

	// Now close
	agg.Ingest(windowagg.Event{Timestamp: 1000, Key: "x", Value: 0})

	got := drain(out)
	var found bool
	for _, e := range got {
		if e.key == "k" && e.windowStart == 100 && e.windowEnd == 110 {
			if e.sum != 3 {
				t.Fatalf("expected key k sum=3, got %#v", got)
			}
			found = true
		}
	}
	if !found {
		t.Fatalf("expected emission for key k in [100,110), got %#v", got)
	}
}

func TestAdditional_MultiWindowEmissionForSameKey(t *testing.T) {
	agg, out := newAggForTest(10, 5)

	agg.Ingest(windowagg.Event{Timestamp: 101, Key: "k", Value: 1})  // [100,110)
	agg.Ingest(windowagg.Event{Timestamp: 115, Key: "k", Value: 2})  // [110,120)
	agg.Ingest(windowagg.Event{Timestamp: 119, Key: "k", Value: 3})  // [110,120)

	// Advance watermark far enough to close both windows
	agg.Ingest(windowagg.Event{Timestamp: 1000, Key: "x", Value: 0})

	got := drain(out)
	if len(got) != 2 {
		t.Fatalf("expected 2 emissions, got %d: %#v", len(got), got)
	}

	byStart := map[int64]float64{}
	for _, e := range got {
		byStart[e.windowStart] = e.sum
	}
	if byStart[100] != 1 {
		t.Fatalf("expected window [100,110) sum=1, got %v", byStart[100])
	}
	if byStart[110] != 5 {
		t.Fatalf("expected window [110,120) sum=5, got %v", byStart[110])
	}
}

func TestAdditional_ZeroAllowedLatenessStrictClosure(t *testing.T) {
	agg, out := newAggForTest(10, 0)

	agg.Ingest(windowagg.Event{Timestamp: 100, Key: "k", Value: 1})

	// With allowed lateness 0, watermark equals maxObserved.
	// maxObserved=110 => wm=110, should NOT close yet.
	agg.Ingest(windowagg.Event{Timestamp: 110, Key: "x", Value: 0})
	if got := drain(out); len(got) != 0 {
		t.Fatalf("expected no emission when watermark==end, got %#v", got)
	}

	// maxObserved=111 => wm=111 (>110): now close.
	agg.Ingest(windowagg.Event{Timestamp: 111, Key: "x", Value: 0})
	if got := drain(out); len(got) != 1 {
		t.Fatalf("expected emission after strict close, got %#v", got)
	}
}

func TestAdditional_ConcurrentIngestNoRacesAndCorrectness(t *testing.T) {
	agg, out := newAggForTest(10, 5)

	var wg sync.WaitGroup
	keys := []string{"a", "b", "c", "d", "e"}

	// Many concurrent writes into same window [100,110)
	for i := 0; i < 1000; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			k := keys[i%len(keys)]
			agg.Ingest(windowagg.Event{Timestamp: 101 + int64(i%5), Key: k, Value: 1})
		}(i)
	}
	wg.Wait()

	// Close
	agg.Ingest(windowagg.Event{Timestamp: 1000, Key: "x", Value: 0})

	got := drain(out)
	if len(got) != len(keys) {
		t.Fatalf("expected %d emissions (one per key), got %d", len(keys), len(got))
	}

	total := 0.0
	for _, e := range got {
		total += e.sum
	}
	if total != 1000 {
		t.Fatalf("expected total sum=1000, got %v", total)
	}

	// And closed window reclaimed; the close-trigger window remains open.
	kc, bc := agg.StateSize()
	if kc != 1 || bc != 1 {
		t.Fatalf("expected only close-trigger window to remain; got keys=%d buckets=%d", kc, bc)
	}
}
