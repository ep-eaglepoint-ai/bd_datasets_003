package tests

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

var (
	RepoRoot   string
	BeforeExe  string
	AfterExe   string
	TargetExe  string
	TestTarget string
	RepoPath   string
	RepoExe    string
)

func init() {
	wd, _ := os.Getwd()
	if strings.HasSuffix(wd, "tests") {
		RepoRoot = filepath.Dir(wd)
	} else {
		RepoRoot = wd
	}

	fmt.Println("TEST_TARGET:", os.Getenv("TEST_TARGET"))
	TestTarget = os.Getenv("TEST_TARGET")
	if TestTarget == "" {
		TestTarget = "after"
		RepoPath = "repository_after"
	}

	if TestTarget == "before" {
		BeforeExe, err := resolveOrBuild("server_before", "repository_before")
		if err != nil {
			fmt.Println("Error building before executable:", err)
		}
		RepoPath = "repository_before"
		TargetExe = BeforeExe
	} else if TestTarget == "after" {
		AfterExe, err := resolveOrBuild("server_after", "repository_after")
		if err != nil {
			fmt.Println("Error building after executable:", err)
		}
		RepoPath = "repository_after"
		TargetExe = AfterExe
	}

}

func resolveOrBuild(name, dir string) (string, error) {
	bin := name
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}

	outPath := filepath.Join(RepoRoot, bin)
	src := filepath.Join(RepoRoot, dir, "server", "main.go")
	if _, err := os.Stat(src); err != nil {
		return "", fmt.Errorf("entrypoint not found: %s", src)
	}
	cmd := exec.Command("go", "build", "-o", outPath, src)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = os.Remove(outPath)
	if err := cmd.Run(); err != nil {
		return "", err
	}

	return outPath, nil
}

func resolveOrBuildClient(name, dir string) (string, error) {
	bin := name
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}

	outPath := filepath.Join(RepoRoot, bin)
	fmt.Println("repo path", RepoRoot)
	src := filepath.Join(RepoRoot, dir, "client", "client.go")
	fmt.Println("final path", src)
	if _, err := os.Stat(src); err != nil {
		return "", fmt.Errorf("client entrypoint not found: %s", src)
	}

	cmd := exec.Command("go", "build", "-o", outPath, src)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	_ = os.Remove(outPath)

	if err := cmd.Run(); err != nil {
		return "", err
	}

	return outPath, nil
}

func startServer(t *testing.T) func() {
	if TargetExe == "" {
		t.Fatalf("no target executable to start server")
	}
	cmd := exec.Command(TargetExe)
	cmd.Env = append(os.Environ(), "PORT=8080")

	if err := cmd.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}

	time.Sleep(300 * time.Millisecond)

	return func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}
}
