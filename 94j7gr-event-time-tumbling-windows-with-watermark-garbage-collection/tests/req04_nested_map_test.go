package tests

import (
"reflect"
"testing"

"windowagg"
)

func TestReq04_StateUsesNestedMap(t *testing.T) {
	// Requirement 4: map[key]map[windowStart]value
	agg, _ := newAggForTest(10, 5)
	aggType := reflect.TypeOf(*agg)
	var found bool
	for i := 0; i < aggType.NumField(); i++ {
		field := aggType.Field(i)
		if field.Type == reflect.TypeOf(map[string]map[int64]float64{}) {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected a nested map type map[string]map[int64]float64 in state")
	}

	// Two windows for the same key should create two inner buckets.
	agg.Ingest(windowagg.Event{Timestamp: 101, Key: "k", Value: 1})
	agg.Ingest(windowagg.Event{Timestamp: 111, Key: "k", Value: 2})

	keys, buckets := agg.StateSize()
	if keys != 1 || buckets != 2 {
		t.Fatalf("expected 1 key and 2 buckets, got keys=%d buckets=%d", keys, buckets)
	}
}
