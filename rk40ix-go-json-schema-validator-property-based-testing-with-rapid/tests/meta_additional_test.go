package tests

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"strings"
	"testing"
)

func TestMeta_FeatureTestFilenameIsDescriptive(t *testing.T) {
	requireFeatureTestFile(t)
	name := filepath.Base(featureTestFile(t))
	if !strings.HasPrefix(name, "test_") || !strings.HasSuffix(name, "_test.go") {
		t.Fatalf("feature test filename must follow descriptive pattern test_*_test.go, got %s", name)
	}
}

func TestMeta_FeatureTestHelpersAreDescriptiveAndCommented(t *testing.T) {
	requireFeatureTestFile(t)
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, featureTestFile(t), nil, parser.ParseComments)
	if err != nil {
		t.Fatalf("failed to parse feature test file: %v", err)
	}

	requiredFunctions := map[string]bool{
		"safeValidate":            false,
		"genUnicodeString":        false,
		"genJSONValue":            false,
		"genValidSchemaValuePair": false,
	}

	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Name == nil {
			continue
		}
		if _, exists := requiredFunctions[fn.Name.Name]; exists {
			requiredFunctions[fn.Name.Name] = true
			if fn.Doc == nil || len(fn.Doc.List) == 0 {
				t.Fatalf("function %s must have a descriptive comment", fn.Name.Name)
			}
		}
	}

	for fn, seen := range requiredFunctions {
		if !seen {
			t.Fatalf("missing helper function %s in feature tests", fn)
		}
	}
}
