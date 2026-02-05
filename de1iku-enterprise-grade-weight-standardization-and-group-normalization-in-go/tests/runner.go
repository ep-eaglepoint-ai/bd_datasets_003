//go:build ignore
// +build ignore

package main

import (
	"os"
	"os/exec"
)

func main() {
	cmd := exec.Command("go", "test", "-timeout", "30s", "-v", ".")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Dir = "/app/tests"
	if err := cmd.Run(); err != nil {
		os.Exit(1)
	}
}
