package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Req 1: Must NOT use external libraries (e.g. go-proxyproto). Standard net only.
func TestNoExternalLibraries(t *testing.T) {
	repoPath := GetRepoPath()
	modPath := filepath.Join(repoPath, "go.mod")
	content, err := os.ReadFile(modPath)
	passed := true
	var msg string
	if err != nil {
		RecordResult("TestNoExternalLibraries", false, err.Error())
		t.Fatal(err)
		return
	}
	modStr := string(content)
	if strings.Contains(modStr, "go-proxyproto") || strings.Contains(modStr, "proxyproto") {
		passed = false
		msg = "go.mod contains external proxy protocol library"
		t.Error(msg)
	}
	RecordResult("TestNoExternalLibraries", passed, msg)
}
