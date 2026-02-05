//go:build ignore

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func main() {
	// 1. Resolve REPO_PATH
	repoPath := os.Getenv("REPO_PATH")
	if repoPath == "" {
		repoPath = "repository_after"
	}
	repoPath = strings.TrimPrefix(repoPath, "./")

	fmt.Printf("Configuring workspace for: %s\n", repoPath)

	// 2. Generate go.work content
	
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Printf("Failed to get cwd: %v\n", err)
		os.Exit(1)
	}
	
	projectRoot := cwd
	if filepath.Base(cwd) == "tests" {
		projectRoot = filepath.Dir(cwd)
	}

	// Try to ensure we point to existing directories
	// Docker uses /app
	
	goWorkContent := fmt.Sprintf(`go 1.25.5

use (
	%s
	%s
	%s
)
`, filepath.Join(projectRoot, "tests"), filepath.Join(projectRoot, "evaluation"), filepath.Join(projectRoot, repoPath))

	// 3. Write go.work to temp file
	tmpDir, err := os.MkdirTemp("", "adain-tests")
	if err != nil {
		fmt.Printf("Failed to create temp dir: %v\n", err)
		os.Exit(1)
	}
	defer os.RemoveAll(tmpDir)

	goWorkPath := filepath.Join(tmpDir, "go.work")
	if err := os.WriteFile(goWorkPath, []byte(goWorkContent), 0644); err != nil {
		fmt.Printf("Failed to write go.work: %v\n", err)
		os.Exit(1)
	}

	// 4. Run tests
	testArgs := []string{"test", "-v", "."}
	
	// Add build tag for repository_after
	if strings.Contains(repoPath, "repository_after") {
		testArgs = []string{"test", "-tags", "after", "-v", "."}
	}
	
	cmd := exec.Command("go", testArgs...)
	cmd.Dir = filepath.Join(projectRoot, "tests")
	cmd.Env = append(os.Environ(), "GOWORK="+goWorkPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		if strings.Contains(repoPath, "repository_before") {
			fmt.Println("Tests failed as expected for repository_before.")
			os.Exit(0)
		}
		fmt.Printf("Test execution failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Test execution successful.")
}
