package tests

import (
	"strings"
	"testing"
)

// TestReq04_CommitSortsNodeIDs verifies requirement 4: Commit must explicitly sort the list of Node IDs before acquiring locks.
func TestReq04_CommitSortsNodeIDs(t *testing.T) {
	src := readRepoSource(t)
	commitStart := strings.Index(src, "func (tx *Transaction) Commit()")
	if commitStart < 0 {
		recordResult("TestReq04_CommitSortsNodeIDs", false, "Commit method not found")
		return
	}
	commitBody := src[commitStart:]
	hasSort := strings.Contains(commitBody, "sort.Strings") || (strings.Contains(commitBody, "sort.Slice") && strings.Contains(commitBody, "ids"))
	// Lock acquisition must appear after sort in Commit (deterministic order).
	sortIdx := strings.Index(commitBody, "sort.Strings")
	if sortIdx < 0 {
		sortIdx = strings.Index(commitBody, "sort.Slice")
	}
	lockIdx := strings.Index(commitBody, "node.mu.Lock()")
	if lockIdx < 0 {
		lockIdx = strings.Index(commitBody, ".Lock()")
	}
	sortBeforeLock := !hasSort || lockIdx < 0 || (sortIdx >= 0 && sortIdx < lockIdx)
	passed := hasSort && sortBeforeLock
	var msg string
	if !passed {
		if !hasSort {
			msg = "Commit does not sort node IDs before acquiring locks"
		} else {
			msg = "Commit must acquire locks after sorting node IDs (sort before Lock in Commit body)"
		}
		t.Error(msg)
	}
	recordResult("TestReq04_CommitSortsNodeIDs", passed, msg)
}
