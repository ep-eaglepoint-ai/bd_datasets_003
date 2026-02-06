package offline_sync_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReq7_MutexInServer(t *testing.T) {
	path := filepath.Join("..", "repository_after", "server.go")
	fset := token.NewFileSet()
	parsed, err := parser.ParseFile(fset, path, nil, parser.AllErrors)
	if err != nil {
		t.Fatalf("parse server.go: %v", err)
	}

	foundSyncImport := false
	for _, imp := range parsed.Imports {
		if imp.Path.Value == "\"sync\"" {
			foundSyncImport = true
			break
		}
	}
	if !foundSyncImport {
		t.Fatalf("expected server.go to import sync")
	}

	content := readFileForTest(t, path)
	if !strings.Contains(content, "mu sync.Mutex") {
		t.Fatalf("expected InventoryServer to declare mu sync.Mutex")
	}
	if !strings.Contains(content, "handleGetState") || !strings.Contains(content, "mu.Lock()") {
		t.Fatalf("expected handleGetState to lock mutex")
	}
	if !strings.Contains(content, "handlePostSync") || !strings.Contains(content, "mu.Lock()") {
		t.Fatalf("expected handlePostSync to lock mutex")
	}
}

func readFileForTest(t *testing.T, path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	return string(data)
}
