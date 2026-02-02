package tests

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// TestReq01_FileNameTransactionManager verifies requirement 1: file must be named transaction_manager.go.
func TestReq01_FileNameTransactionManager(t *testing.T) {
	repoPath := getRepoPath()
	fp := filepath.Join(repoPath, "transaction_manager.go")
	info, err := os.Stat(fp)
	passed := err == nil && !info.IsDir()
	var msg string
	if !passed {
		msg = fmt.Sprintf("transaction_manager.go not found or not a file: %v", err)
		t.Error(msg)
	}
	recordResult("TestReq01_FileNameTransactionManager", passed, msg)
}
