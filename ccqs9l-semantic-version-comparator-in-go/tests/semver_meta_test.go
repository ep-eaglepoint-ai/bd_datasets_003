package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func loadImpl(t *testing.T, name string) string {
	t.Helper()

	path := filepath.Join("tests/resources", name)
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read impl %s: %v", name, err)
	}
	return string(b)
}

func runSuite(t *testing.T, filename string) error {
	t.Helper()

	implPath := filepath.Join("tests", "resources", filename)
	cmd := exec.Command("go", "test", "-v", "../repository_after")
	cmd.Env = append(os.Environ(),
		"REPO_PATH="+implPath,
		"GO111MODULE=off",
	)

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
