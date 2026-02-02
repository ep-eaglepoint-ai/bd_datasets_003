package tests

import (
	"testing"
)

// TestReq11_NodeIDConsistency verifies requirement 11: Node IDs should be handled consistently (e.g. string or int64) to support sorting.
func TestReq11_NodeIDConsistency(t *testing.T) {
	tm := getManager(t)
	// Write in non-sorted order (C, B, A); commit must succeed and apply deterministically.
	tx := tm.Begin()
	_ = tx.Write("C", 3)
	_ = tx.Write("B", 2)
	_ = tx.Write("A", 1)
	err := tx.Commit()
	passed := err == nil
	tx2 := tm.Begin()
	a, _ := tx2.Read("A")
	b, _ := tx2.Read("B")
	c, _ := tx2.Read("C")
	tx2.Commit()
	passed = passed && a == 1 && b == 2 && c == 3
	var msg string
	if !passed {
		msg = "Node IDs must be consistent (string) and support sorting; Read/Write/Commit failed or wrong order"
		t.Error(msg)
	}
	recordResult("TestReq11_NodeIDConsistency", passed, msg)
}
