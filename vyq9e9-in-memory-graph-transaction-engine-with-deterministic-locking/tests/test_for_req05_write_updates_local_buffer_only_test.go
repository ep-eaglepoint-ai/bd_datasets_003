package tests

import (
	"fmt"
	"testing"
)

// TestReq05_WriteUpdatesLocalBufferOnly verifies requirement 5: Write must update a local map/buffer, NOT the global node state directly.
func TestReq05_WriteUpdatesLocalBufferOnly(t *testing.T) {
	tm := getManager(t)
	tx0 := tm.Begin()
	_ = tx0.Write("A", 0)
	_ = tx0.Write("B", 0)
	_ = tx0.Commit()
	// Tx1: buffered writes to A and B, not yet committed.
	tx := tm.Begin()
	_ = tx.Write("A", 50)
	_ = tx.Write("B", 100)
	// Tx2: must see only committed state (A=0, B=0).
	tx2 := tm.Begin()
	balA, errA := tx2.Read("A")
	balB, errB := tx2.Read("B")
	tx2.Commit()
	if errA != nil || errB != nil {
		t.Fatalf("Read failed: A=%v B=%v", errA, errB)
	}
	passed := balA == 0 && balB == 0
	var msg string
	if !passed {
		msg = fmt.Sprintf("Write leaked to global state: other tx saw A=%d (expected 0), B=%d (expected 0)", balA, balB)
		t.Error(msg)
	}
	recordResult("TestReq05_WriteUpdatesLocalBufferOnly", passed, msg)
}
