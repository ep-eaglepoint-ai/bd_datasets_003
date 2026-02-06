package offline_sync_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestReq1_NoExternalLibraries(t *testing.T) {
	files := []string{
		filepath.Join("..", "repository_after", "client.go"),
		filepath.Join("..", "repository_after", "server.go"),
	}

	for _, path := range files {
		fset := token.NewFileSet()
		parsed, err := parser.ParseFile(fset, path, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("parse imports %s: %v", path, err)
		}
		for _, imp := range parsed.Imports {
			p, err := strconv.Unquote(imp.Path.Value)
			if err != nil {
				t.Fatalf("unquote import path in %s: %v", path, err)
			}
			if strings.Contains(p, ".") {
				t.Fatalf("external import found in %s: %s", path, p)
			}
		}
	}
}

func TestReq1_NoExternalLibrariesInModule(t *testing.T) {
	modPath := filepath.Join("..", "repository_after", "go.mod")
	data, err := os.ReadFile(modPath)
	if err != nil {
		t.Fatalf("read go.mod: %v", err)
	}
	if strings.Contains(string(data), "require") {
		t.Fatalf("go.mod should not require external modules: %s", modPath)
	}
}
