//go:build tools
// +build tools

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	repoPath := os.Getenv("REPO_PATH")
	if repoPath == "" {
		fmt.Fprintln(os.Stderr, "REPO_PATH environment variable not set")
		os.Exit(1)
	}

	testsDir := filepath.Join(".", "tests")
	cmd := exec.Command("go", "test", "-timeout", "60s", "-v", "./...")
	cmd.Dir = testsDir
	cmd.Env = append(os.Environ(), fmt.Sprintf("REPO_PATH=%s", repoPath))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		if strings.Contains(repoPath, "repository_before") {
			fmt.Fprintln(os.Stderr, "warning: repository_before tests failed; exiting 0 by design")
			os.Exit(0)
		}
		if ee, ok := err.(*exec.ExitError); ok {
			os.Exit(ee.ExitCode())
		}
		os.Exit(1)
	}
}
