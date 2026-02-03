package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestAtomicMoveUsesRename verifies that the implementation uses os.Rename for moving
// files to live and rejected directories (atomic move; no copy+delete).
func TestAtomicMoveUsesRename(t *testing.T) {
	repoPath := GetRepoPath()
	deployPath := filepath.Join(repoPath, "deploy.go")
	data, err := os.ReadFile(deployPath)
	if err != nil {
		RecordResult("TestAtomicMoveUsesRename", false, err.Error())
		t.Fatal(err)
	}
	content := string(data)

	// Must define both move functions
	if !strings.Contains(content, "MoveToLive") {
		RecordResult("TestAtomicMoveUsesRename", false, "deploy.go must define MoveToLive")
		t.Fatal("deploy.go must define MoveToLive")
	}
	if !strings.Contains(content, "MoveToRejected") {
		RecordResult("TestAtomicMoveUsesRename", false, "deploy.go must define MoveToRejected")
		t.Fatal("deploy.go must define MoveToRejected")
	}

	// Both must use os.Rename for atomicity (prompt requirement)
	if !strings.Contains(content, "os.Rename") {
		RecordResult("TestAtomicMoveUsesRename", false, "deploy.go must use os.Rename for atomic move")
		t.Fatal("deploy.go must use os.Rename for atomic move; copy+delete is not atomic")
	}

	// Should have at least two calls (MoveToLive and MoveToRejected each use Rename)
	renameCount := strings.Count(content, "os.Rename")
	if renameCount < 2 {
		RecordResult("TestAtomicMoveUsesRename", false, "deploy.go must use os.Rename in both MoveToLive and MoveToRejected")
		t.Fatalf("deploy.go must use os.Rename in both move functions; found %d occurrence(s)", renameCount)
	}

	RecordResult("TestAtomicMoveUsesRename", true, "")
}
