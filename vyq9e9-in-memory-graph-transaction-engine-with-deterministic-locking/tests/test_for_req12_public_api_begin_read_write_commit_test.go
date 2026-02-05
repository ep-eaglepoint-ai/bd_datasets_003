package tests

import (
	"fmt"
	"testing"
)

// TestReq12_PublicAPIBeginReadWriteCommit verifies requirement 12: must expose Begin, Read, Write, and Commit methods.
func TestReq12_PublicAPIBeginReadWriteCommit(t *testing.T) {
	tm := getManager(t)
	// Begin; Read (existing or create via Write); Write; Commit.
	tx := tm.Begin()
	_, err := tx.Read("Z")
	if err != nil {
		_ = tx.Write("Z", 0)
	}
	_ = tx.Write("Z", 1)
	err = tx.Commit()
	passed := err == nil
	var msg string
	if !passed {
		msg = fmt.Sprintf("Public API Begin/Read/Write/Commit failed: %v", err)
		t.Error(msg)
	}
	// Read-only transaction: Begin, Read, Commit (no Write) must succeed.
	txRO := tm.Begin()
	_, _ = txRO.Read("Z")
	errRO := txRO.Commit()
	if errRO != nil {
		passed = false
		msg = fmt.Sprintf("Read-only tx (Begin, Read, Commit) must succeed: %v", errRO)
		t.Error(msg)
	}
	recordResult("TestReq12_PublicAPIBeginReadWriteCommit", passed, msg)
}
