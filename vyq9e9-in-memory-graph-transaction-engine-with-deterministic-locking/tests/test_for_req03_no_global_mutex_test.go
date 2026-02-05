package tests

import (
	"strings"
	"testing"
)

// TestReq03_NoGlobalMutex verifies requirement 3: must NOT use a single global mutex for the entire commit process.
func TestReq03_NoGlobalMutex(t *testing.T) {
	src := readRepoSource(t)
	idx := strings.Index(src, "func (tx *Transaction) Commit()")
	if idx < 0 {
		recordResult("TestReq03_NoGlobalMutex", false, "Commit method not found")
		return
	}
	commitBody := src[idx:]
	hasPerNodeLock := strings.Contains(commitBody, "node.mu.Lock()")
	// Reject pattern: single tm.mu.Lock() / defer tm.mu.Unlock() wrapping entire commit (performance failure).
	hasGlobalCommitLock := (strings.Contains(commitBody, "tx.tm.mu.Lock()") || strings.Contains(commitBody, "tm.mu.Lock()")) &&
		strings.Contains(commitBody, "defer") && (strings.Contains(commitBody, "tx.tm.mu.Unlock()") || strings.Contains(commitBody, "tm.mu.Unlock()"))
	passed := hasPerNodeLock && !hasGlobalCommitLock
	var msg string
	if !passed {
		if hasGlobalCommitLock {
			msg = "Commit must not use a single global mutex (tx.tm.mu/tm.mu) for the entire commit; use per-node locks"
		} else {
			msg = "Commit uses single global mutex for entire commit instead of per-node locks"
		}
		t.Error(msg)
	}
	recordResult("TestReq03_NoGlobalMutex", passed, msg)
}
