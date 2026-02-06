package tests

import (
"reflect"
"sync"
"testing"
)

func TestReq06_UsesRWMutex(t *testing.T) {
	// Requirement 6: sync.RWMutex (or sync.Map) must protect state.
	agg, _ := newAggForTest(10, 5)
	aggType := reflect.TypeOf(*agg)
	var hasRWMutex bool
	var hasSyncMap bool
	for i := 0; i < aggType.NumField(); i++ {
		field := aggType.Field(i)
		if field.Type == reflect.TypeOf(sync.RWMutex{}) {
			hasRWMutex = true
		}
		if field.Type == reflect.TypeOf(sync.Map{}) {
			hasSyncMap = true
		}
	}
	if !hasRWMutex && !hasSyncMap {
		t.Fatalf("expected sync.RWMutex or sync.Map to protect state")
	}
}
