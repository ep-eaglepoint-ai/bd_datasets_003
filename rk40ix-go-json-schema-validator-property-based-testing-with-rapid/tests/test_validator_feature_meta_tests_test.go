package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func targetRepoPath(t *testing.T) string {
	t.Helper()
	if p := os.Getenv("REPO_PATH"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return p
		}
		if idx := strings.Index(p, "/app/"); idx != -1 {
			normalized := p[idx:]
			if _, err := os.Stat(normalized); err == nil {
				return normalized
			}
		}
		return p
	}
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get wd: %v", err)
	}
	return filepath.Join(filepath.Dir(wd), "repository_after")
}

func featureTestFile(t *testing.T) string {
	t.Helper()
	return filepath.Join(targetRepoPath(t), "validator", "test_validator_feature_tests_test.go")
}

func requireFeatureTestFile(t *testing.T) {
	t.Helper()
	if _, err := os.Stat(featureTestFile(t)); err != nil {
		t.Fatalf("feature test file is not present for this repo target: %v", err)
	}
}

func runTargetRepoGoTest(t *testing.T, runExpr string) {
	t.Helper()
	requireFeatureTestFile(t)
	cmd := exec.Command("go", "test", "./validator", "-run", runExpr, "-count=1")
	cmd.Dir = targetRepoPath(t)
	cmd.Env = append(os.Environ(), "GOWORK=off")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("go test failed for %s: %v\n%s", runExpr, err, string(out))
	}
}

func readFeatureSource(t *testing.T) string {
	t.Helper()
	requireFeatureTestFile(t)
	b, err := os.ReadFile(featureTestFile(t))
	if err != nil {
		t.Fatalf("failed reading feature test file: %v", err)
	}
	return string(b)
}
