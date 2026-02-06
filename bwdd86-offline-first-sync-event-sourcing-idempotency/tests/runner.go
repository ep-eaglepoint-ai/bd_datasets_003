//go:build tools
// +build tools

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func getRootDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "."
	}

	base := filepath.Base(cwd)
	if base == "tests" || base == "evaluation" {
		return filepath.Dir(cwd)
	}
	return cwd
}

func main() {
	rootDir := getRootDir()
	testsDir := filepath.Join(rootDir, "tests")

	cmd := exec.Command("go", "test", "-timeout", "10s", "-v", ".")
	cmd.Dir = testsDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			os.Exit(ee.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "runner error: %v\n", err)
		os.Exit(1)
	}
}
