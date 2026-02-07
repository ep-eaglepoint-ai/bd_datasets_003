package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

type TestResult struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

type Report struct {
	RunID       string                 `json:"run_id"`
	StartedAt   string                 `json:"started_at"`
	FinishedAt  string                 `json:"finished_at"`
	Duration    float64                `json:"duration_seconds"`
	Environment map[string]interface{} `json:"environment"`
	Before      TestResult             `json:"before"`
	After       TestResult             `json:"after"`
	Comparison  map[string]interface{} `json:"comparison"`
	Success     bool                   `json:"success"`
	Error       string                 `json:"error,omitempty"`
}

func getEnvironmentInfo() map[string]interface{} {
	return map[string]interface{}{
		"go_version": runtime.Version(),
		"os":         runtime.GOOS,
		"arch":       runtime.GOARCH,
		"cpus":       runtime.NumCPU(),
	}
}

// runGoTests executes `go test -v` on the given repo path and returns TestResult
func runGoTests(repoPath string, implPath string, testFile string) TestResult {
	testPath := filepath.Join(repoPath, testFile)
	if _, err := os.Stat(testPath); os.IsNotExist(err) {
		return TestResult{
			Passed:     false,
			ReturnCode: 1,
			Output:     fmt.Sprintf("Test file %s does not exist in repo %s", testFile, repoPath),
		}
	}
	cmd := exec.Command("go", "test", "-v", "./...")
	cmd.Dir = repoPath
	cmd.Env = append(os.Environ(), "REPO_PATH="+implPath, "GO111MODULE=on")

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	err := cmd.Run()
	output := stdoutBuf.String() + stderrBuf.String()

	passed := err == nil

	var returnCode int
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			returnCode = exitErr.ExitCode()
		} else {
			returnCode = 1
		}
	} else {
		returnCode = 0
	}

	return TestResult{
		Passed:     passed,
		ReturnCode: returnCode,
		Output:     output,
	}
}

func main() {
	runID := fmt.Sprintf("%d", time.Now().UnixNano())
	start := time.Now()

	rootDir, err := os.Getwd()
	if err != nil {
		fmt.Printf("Failed to get working directory: %v\n", err)
		os.Exit(1)
	}

	beforeRepo := "repository_before"
	afterRepo := "repository_after"
	implPath := "repository_before/semver.go"
	testFile := "semver_test.go"

	fmt.Println("Running tests on 'before' repo...")
	beforeResult := runGoTests(beforeRepo, implPath, testFile)

	fmt.Println("Running tests on 'after' repo...")
	afterResult := runGoTests(afterRepo, implPath, testFile)

	duration := time.Since(start).Seconds()

	improvementSummary := "No improvement detected."
	if !beforeResult.Passed && afterResult.Passed {
		improvementSummary = "Added tests met requirements."
	} else if beforeResult.Passed && afterResult.Passed {
		improvementSummary = "Tests passed in both states (Verify baseline expectation)."
	} else if !afterResult.Passed {
		improvementSummary = "Added tests failed to pass requirements."
	}

	report := Report{
		RunID:       runID,
		StartedAt:   start.Format(time.RFC3339),
		FinishedAt:  time.Now().Format(time.RFC3339),
		Duration:    duration,
		Environment: getEnvironmentInfo(),
		Before:      beforeResult,
		After:       afterResult,
		Comparison: map[string]interface{}{
			"passed_gate":         afterResult.Passed,
			"improvement_summary": improvementSummary,
		},
		Success: afterResult.Passed,
	}

	// Ensure reports folder exists
	reportsDir := filepath.Join(rootDir, "evaluation", "reports")
	if err := os.MkdirAll(reportsDir, 0755); err != nil {
		fmt.Printf("Failed to create reports dir: %v\n", err)
		os.Exit(1)
	}

	reportPath := filepath.Join(reportsDir, "report.json")
	reportFile, err := os.Create(reportPath)
	if err != nil {
		fmt.Printf("Failed to create report file: %v\n", err)
		os.Exit(1)
	}
	defer reportFile.Close()

	enc := json.NewEncoder(reportFile)
	enc.SetIndent("", "  ")
	if err := enc.Encode(report); err != nil {
		fmt.Printf("Failed to write report: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Evaluation complete. Success: %v\n", report.Success)
	fmt.Printf("Report written to %s\n", reportPath)

	if !report.Success {
		os.Exit(1)
	}
}
