package tests

import (
	"reflect"
	"testing"

	"repository_after"
)

// TestReq02_RWMutexPerNode verifies requirement 2: sync.RWMutex per Node (fine-grained locking).
func TestReq02_RWMutexPerNode(t *testing.T) {
	typ := reflect.TypeOf(repository_after.Node{})
	var hasRWMutex bool
	var hasPlainMutex bool
	for i := 0; i < typ.NumField(); i++ {
		f := typ.Field(i)
		switch f.Type.String() {
		case "sync.RWMutex":
			hasRWMutex = true
		case "sync.Mutex":
			hasPlainMutex = true
		}
	}
	passed := hasRWMutex && !hasPlainMutex
	var msg string
	if !passed {
		if hasPlainMutex {
			msg = "Node must use sync.RWMutex per node, not sync.Mutex"
		} else {
			msg = "Node type does not have a sync.RWMutex field"
		}
		t.Error(msg)
	}
	recordResult("TestReq02_RWMutexPerNode", passed, msg)
}
