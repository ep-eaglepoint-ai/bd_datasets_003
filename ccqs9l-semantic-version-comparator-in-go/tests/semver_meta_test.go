package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func runSuite(t *testing.T, filename string) error {
	t.Helper()

	repo_path := os.Getenv("REPO_PATH")
	if repo_path == "" {
		t.Fatal("REPO_PATH environment variable not set")
	}

	source := filepath.Join("resources", filename)
	target := filepath.Join("..", repo_path, "semver.go")
	var originalData []byte
	if data, err := os.ReadFile(target); err == nil {
		originalData = data
	}

	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	if err := os.WriteFile(target, data, 0644); err != nil {
		return err
	}

	defer func() {
		if originalData != nil {
			_ = os.WriteFile(target, originalData, 0644)
		} else {
			_ = os.Remove(target)
		}
	}()

	testFile := filepath.Join("..", repo_path, "semver_test.go")
	if _, err := os.Stat(testFile); os.IsNotExist(err) {
		t.Fatalf("Test file semver_test.go does not exist in repo %s", repo_path)
	}
	cmd := exec.Command("go", "test", "-v", "../"+repo_path)
	cmd.Env = append(os.Environ(), "GO111MODULE=off")
	out, err := cmd.CombinedOutput()
	t.Log(string(out))
	return err
}

func assertFails(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatalf("tests passed, but should have failed")
	}
}

func assertPasses(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("tests failed, but should have passed")
	}
}

func TestSuiteDetectsLexicographicCompare(t *testing.T) {
	err := runSuite(t, "lexicographic/broken_lexicographic.go")
	assertFails(t, err)
}

func TestSuiteDetectsPrereleaseBug(t *testing.T) {
	err := runSuite(t, "prerelease/broken_prerelease.go")
	assertFails(t, err)
}

func TestSuiteDetectsMissingComponentsBug(t *testing.T) {
	err := runSuite(t, "missing_comps/broken_missing_components.go")
	assertFails(t, err)
}

func TestSuiteDetectsPanic(t *testing.T) {
	err := runSuite(t, "panic/broken_panic.go")
	assertFails(t, err)
}

func TestSuitePassesCorrectImplementation(t *testing.T) {
	err := runSuite(t, "correct.go")
	assertPasses(t, err)
}
