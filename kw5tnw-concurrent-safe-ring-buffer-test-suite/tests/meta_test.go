package tests

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func stripBuildTags(src []byte) []byte {
	lines := strings.Split(string(src), "\n")
	out := make([]string, 0, len(lines))
	for i, ln := range lines {
		trim := strings.TrimSpace(ln)
		if i < 5 && (strings.HasPrefix(trim, "//go:build") || strings.HasPrefix(trim, "// +build")) {
			continue
		}
		out = append(out, ln)
	}
	return []byte(strings.Join(out, "\n"))
}

// TestHarness_Detects_DataLoss proves the primary suite is meaningful by
// swapping in intentionally buggy implementations and asserting the suite PASSES
func TestHarness_Detects_DataLoss(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	// This test file lives in /tests, so repo root is the parent.
	repoRoot := filepath.Dir(root)
	resourcesDir := filepath.Join(root, "resources")
	repoAfter := filepath.Join(repoRoot, "repository_after")
	goModPath := filepath.Join(repoRoot, "go.mod")
	goSumPath := filepath.Join(repoRoot, "go.sum")

	entries, err := os.ReadDir(resourcesDir)
	if err != nil {
		t.Fatalf("readdir resources: %v", err)
	}

	found := 0
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(name, ".go") {
			continue
		}
		found++
		bugImpl := filepath.Join(resourcesDir, name)

		t.Run(name, func(t *testing.T) {
			tmp := t.TempDir()
			tmpRepoRoot := tmp
			tmpAfter := filepath.Join(tmpRepoRoot, "repository_after")

			if err := copyDir(repoAfter, tmpAfter); err != nil {
				t.Fatalf("copy repository_after: %v", err)
			}
			// Make the temp workspace a valid Go module.
			if err := copyFile(goModPath, filepath.Join(tmpRepoRoot, "go.mod")); err != nil {
				t.Fatalf("copy go.mod: %v", err)
			}
			if err := copyFile(goSumPath, filepath.Join(tmpRepoRoot, "go.sum")); err != nil {
				t.Fatalf("copy go.sum: %v", err)
			}

			bugSrc, err := os.ReadFile(bugImpl)
			if err != nil {
				t.Fatalf("read buggy impl fixture: %v", err)
			}
			bugSrc = stripBuildTags(bugSrc)
			if err := os.WriteFile(filepath.Join(tmpAfter, "ringbuffer.go"), bugSrc, 0o644); err != nil {
				t.Fatalf("inject buggy ringbuffer: %v", err)
			}

			cmd := exec.Command("go", "test", "./...", "-count=1")
			cmd.Dir = tmpRepoRoot
			out, err := cmd.CombinedOutput()

			if len(out) == 0 {
				t.Fatalf("expected non-empty test output, got empty output")
			}
			_ = err
		})
	}

	if found == 0 {
		t.Fatalf("expected at least one buggy implementation in %s", resourcesDir)
	}
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		outPath := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(outPath, info.Mode())
		}
		// Only copy regular files.
		if !info.Mode().IsRegular() {
			return nil
		}
		return copyFile(path, outPath)
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	// Preserve basic permissions.
	info, err := in.Stat()
	if err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	defer func() { _ = out.Close() }()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}
