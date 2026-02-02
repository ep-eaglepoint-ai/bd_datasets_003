package tests

import (
	"fmt"
	"strings"
	"testing"
)

// TestReq06_GlobalStateAfterLocks verifies requirement 6: global state must only be updated after all locks are successfully acquired.
func TestReq06_GlobalStateAfterLocks(t *testing.T) {
	tm := getManager(t)
	tx0 := tm.Begin()
	_ = tx0.Write("B", 0)
	_ = tx0.Commit()
	tx := tm.Begin()
	_ = tx.Write("B", 100)
	_ = tx.Commit()
	tx2 := tm.Begin()
	bal, _ := tx2.Read("B")
	tx2.Commit()
	passed := bal == 100
	var msg string
	if !passed {
		msg = fmt.Sprintf("After Commit, global state should reflect write; got balance %d", bal)
		t.Error(msg)
	}
	// Source check: Balance update in Commit must appear after lock acquisition (apply only after locks held).
	src := readRepoSource(t)
	commitStart := strings.Index(src, "func (tx *Transaction) Commit()")
	if commitStart >= 0 {
		commitBody := src[commitStart:]
		lockIdx := strings.Index(commitBody, "node.mu.Lock()")
		if lockIdx < 0 {
			lockIdx = strings.Index(commitBody, ".Lock()")
		}
		balanceUpdateIdx := strings.Index(commitBody, "Balance +=")
		if balanceUpdateIdx < 0 {
			balanceUpdateIdx = strings.Index(commitBody, "Balance+=")
		}
		if lockIdx >= 0 && balanceUpdateIdx >= 0 && balanceUpdateIdx < lockIdx {
			passed = false
			msg = "Commit must update global state (Balance) only after acquiring locks; Balance update appears before Lock in source"
			t.Error(msg)
		}
	}
	recordResult("TestReq06_GlobalStateAfterLocks", passed, msg)
}
