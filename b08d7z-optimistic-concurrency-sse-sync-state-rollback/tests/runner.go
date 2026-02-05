package main

import (
	"fmt"
	"os"
	"os/exec"
)

func main() {
	repoPath := os.Getenv("REPO_PATH")
	if repoPath == "" {
		repoPath = "repository_after"
	}

	// Run tests with wrapper for better reporting
	cmd := exec.Command("go", "run", "test_wrapper.go")
	cmd.Dir = "tests"
	cmd.Env = append(os.Environ(), fmt.Sprintf("REPO_PATH=%s", repoPath))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	if err := cmd.Run(); err != nil {
		os.Exit(1)
	}
}