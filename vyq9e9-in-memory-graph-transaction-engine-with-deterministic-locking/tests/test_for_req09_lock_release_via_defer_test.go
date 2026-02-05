package tests

import (
	"strings"
	"testing"
)

// TestReq09_LockReleaseViaDefer verifies requirement 9: lock releases must be handled via defer to guarantee cleanup during panics.
func TestReq09_LockReleaseViaDefer(t *testing.T) {
	src := readRepoSource(t)
	commitStart := strings.Index(src, "func (tx *Transaction) Commit()")
	if commitStart < 0 {
		recordResult("TestReq09_LockReleaseViaDefer", false, "Commit not found")
		return
	}
	commitBody := src[commitStart:]
	hasDefer := strings.Contains(commitBody, "defer")
	hasUnlock := strings.Contains(commitBody, "Unlock()")
	// Per-node unlock via defer (e.g. defer node.mu.Unlock() in lock loop).
	hasDeferNodeUnlock := strings.Contains(commitBody, "defer") && (strings.Contains(commitBody, "node.mu.Unlock()") || strings.Contains(commitBody, "Unlock()"))
	passed := hasDefer && hasUnlock && hasDeferNodeUnlock
	var msg string
	if !passed {
		if !hasDefer || !hasUnlock {
			msg = "Commit must release locks via defer to guarantee cleanup during panics"
		} else {
			msg = "Commit must use defer for per-node Unlock (e.g. defer node.mu.Unlock())"
		}
		t.Error(msg)
	}
	recordResult("TestReq09_LockReleaseViaDefer", passed, msg)
}
