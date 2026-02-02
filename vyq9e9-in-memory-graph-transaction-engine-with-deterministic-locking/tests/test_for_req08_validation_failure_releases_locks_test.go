package tests

import (
	"fmt"
	"testing"
)

// TestReq08_ValidationFailureReleasesLocks verifies requirement 8: if validation fails, release locks and return error without modifying global state.
func TestReq08_ValidationFailureReleasesLocks(t *testing.T) {
	tm := getManager(t)
	tx0 := tm.Begin()
	_ = tx0.Write("D", 0)
	_ = tx0.Commit()
	tx1 := tm.Begin()
	_ = tx1.Write("D", -1)
	_ = tx1.Commit()
	tx2 := tm.Begin()
	_ = tx2.Write("D", 5)
	err2 := tx2.Commit()
	passed := err2 == nil
	var msg string
	if !passed {
		msg = fmt.Sprintf("After validation failure, second transaction could not commit: %v", err2)
		t.Error(msg)
	}
	recordResult("TestReq08_ValidationFailureReleasesLocks", passed, msg)
}
