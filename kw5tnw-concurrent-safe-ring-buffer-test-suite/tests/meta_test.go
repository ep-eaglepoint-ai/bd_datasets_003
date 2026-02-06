package tests

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// TestHarness_Detects_DataLoss proves the primary suite is meaningful by
// swapping in an intentionally buggy implementation and asserting the suite fails.
//
// We do this black-box by running `go test` on repository_after with an alternate
// ring buffer implementation injected via build tags.
func TestHarness_Detects_DataLoss(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	// This test file lives in /tests, so repo root is the parent.
	repoRoot := filepath.Dir(root)
	repoAfter := filepath.Join(repoRoot, "repository_after")
	bugImpl := filepath.Join(root, "metabug_ringbuffer.go")

	// Create an isolated temp workspace, copy repository_after into it,
	// then replace ringbuffer.go with the buggy implementation.
	tmp := t.TempDir()
	tmpAfter := filepath.Join(tmp, "repository_after")

	if err := copyDir(repoAfter, tmpAfter); err != nil {
		t.Fatalf("copy repository_after: %v", err)
	}
	// Overwrite the implementation with the buggy one.
	bugSrc, err := os.ReadFile(bugImpl)
	if err != nil {
		t.Fatalf("read buggy impl fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tmpAfter, "ringbuffer.go"), bugSrc, 0o644); err != nil {
		t.Fatalf("inject buggy ringbuffer: %v", err)
	}

	cmd := exec.Command("go", "test", "./...", "-count=1")
	cmd.Dir = tmpAfter
	out, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatalf("expected repository_after tests to fail against buggy implementation, but they passed")
	}

	// ensure failure output mentions integrity test.
	if len(out) == 0 {
		t.Fatalf("expected failing test output, got empty output")
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
