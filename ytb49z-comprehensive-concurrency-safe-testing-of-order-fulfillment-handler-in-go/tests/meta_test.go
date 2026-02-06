package meta

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// runGoTest executes "go test -v -count=1" in the provided directory.
func runGoTest(t *testing.T, dir string) (string, error) {
	t.Helper()
	cmd := exec.Command("go", "test", "-v", "-count=1", "./...")
	cmd.Dir = dir
	cmd.Env = os.Environ()
	out, err := cmd.CombinedOutput()
	return string(out), err
}

// buildTempModule creates a deterministic temp module for testing resources.
func buildTempModule(t *testing.T, implPath, repoAfterPath string) string {
	t.Helper()

	tempRoot := filepath.Join(os.TempDir(), "order-meta-tests")
	_ = os.RemoveAll(tempRoot)
	if err := os.MkdirAll(tempRoot, 0o755); err != nil {
		t.Fatalf("temp dir: %v", err)
	}

	// Copy implementation main.go.
	srcMain := filepath.Join(implPath, "main.go")
	dstMain := filepath.Join(tempRoot, "main.go")
	copyFile(t, srcMain, dstMain)

	// Copy canonical tests.
	srcTest := filepath.Join(repoAfterPath, "order_test.go")
	dstTest := filepath.Join(tempRoot, "order_test.go")
	copyFile(t, srcTest, dstTest)

	// Write go.mod with local testify replace to avoid network.
	goMod := fmt.Sprintf(
		"module order\n\ngo 1.22\n\nrequire github.com/stretchr/testify v0.0.0\n\nreplace github.com/stretchr/testify => %s\n",
		filepath.Join(repoAfterPath, "testify"),
	)
	if err := os.WriteFile(filepath.Join(tempRoot, "go.mod"), []byte(goMod), 0o644); err != nil {
		t.Fatalf("write go.mod: %v", err)
	}

	return tempRoot
}

// copyFile performs a simple file copy.
func copyFile(t *testing.T, src, dst string) {
	t.Helper()
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatalf("read %s: %v", src, err)
	}
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		t.Fatalf("write %s: %v", dst, err)
	}
}

func TestMeta_MainSuitePasses(t *testing.T) {
	wd, _ := os.Getwd()
	root := filepath.Clean(filepath.Join(wd, ".."))
	repoAfter := filepath.Join(root, "repository_after")

	out, err := runGoTest(t, repoAfter)
	if err != nil {
		t.Fatalf("expected repository_after tests to pass, got error: %v\n%s", err, out)
	}
}

func TestMeta_ResourcesFail(t *testing.T) {
	wd, _ := os.Getwd()
	root := filepath.Clean(filepath.Join(wd, ".."))
	repoAfter := filepath.Join(root, "repository_after")
	resourcesRoot := filepath.Join(wd, "resources")

	entries, err := os.ReadDir(resourcesRoot)
	if err != nil {
		t.Fatalf("read resources: %v", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		resourcePath := filepath.Join(resourcesRoot, entry.Name())
		t.Run(entry.Name(), func(t *testing.T) {
			tempModule := buildTempModule(t, resourcePath, repoAfter)
			out, err := runGoTest(t, tempModule)
			if err == nil {
				t.Fatalf("expected tests to fail for %s, but they passed:\n%s", entry.Name(), out)
			}
			if !strings.Contains(out, "FAIL") && !strings.Contains(out, "panic") {
				t.Fatalf("expected failing output for %s, got:\n%s", entry.Name(), out)
			}
		})
	}
}
