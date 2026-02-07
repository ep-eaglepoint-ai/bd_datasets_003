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

	"github.com/google/uuid"
)

// Report represents the evaluation report
type Report struct {
	RunID           string          `json:"run_id"`
	StartedAt       string          `json:"started_at"`
	FinishedAt      string          `json:"finished_at"`
	DurationSeconds float64         `json:"duration_seconds"`
	Environment     Environment     `json:"environment"`
	Before          TestResult      `json:"before"`
	After           TestResult      `json:"after"`
	Comparison      Comparison      `json:"comparison"`
	Success         bool            `json:"success"`
	Error           *string         `json:"error"`
}

// Environment holds environment information
type Environment struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
}

// TestResult holds the result of a test run
type TestResult struct {
	Tests   TestStatus        `json:"tests"`
	Metrics map[string]interface{} `json:"metrics"`
}

// TestStatus holds test status information
type TestStatus struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
	NumTests   int    `json:"num_tests"`
	NumPassed  int    `json:"num_passed"`
	NumFailed  int    `json:"num_failed"`
}

// Comparison holds comparison results
type Comparison struct {
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

func main() {
	fmt.Println("Starting Raft KV Store Evaluation...")
	fmt.Println("=" + string(make([]byte, 50)))

	startTime := time.Now()
	runID := uuid.New().String()

	report := Report{
		RunID:     runID,
		StartedAt: startTime.Format(time.RFC3339),
		Environment: Environment{
			GoVersion: runtime.Version(),
			Platform:  runtime.GOOS + "-" + runtime.GOARCH,
		},
		Before: TestResult{Metrics: make(map[string]interface{})},
		After:  TestResult{Metrics: make(map[string]interface{})},
	}

	// Run tests against repository_before (should fail or have no code)
	fmt.Println("\n[1/2] Testing repository_before...")
	beforeResult := runTests("repository_before")
	report.Before.Tests = beforeResult

	// Run tests against repository_after
	fmt.Println("\n[2/2] Testing repository_after...")
	afterResult := runTests("repository_after")
	report.After.Tests = afterResult

	// Calculate metrics for after
	report.After.Metrics["unit_tests_passed"] = afterResult.NumPassed
	report.After.Metrics["total_tests"] = afterResult.NumTests

	endTime := time.Now()
	report.FinishedAt = endTime.Format(time.RFC3339)
	report.DurationSeconds = endTime.Sub(startTime).Seconds()

	// Determine overall success
	report.Success = afterResult.Passed && !beforeResult.Passed
	report.Comparison.PassedGate = report.Success

	if report.Success {
		report.Comparison.ImprovementSummary = fmt.Sprintf(
			"Implementation complete: %d tests passing in repository_after, 0 tests passing in repository_before",
			afterResult.NumPassed,
		)
	} else if afterResult.Passed && beforeResult.Passed {
		report.Comparison.ImprovementSummary = "Both repositories pass tests - this may indicate incomplete before state"
	} else if !afterResult.Passed {
		errMsg := fmt.Sprintf("Tests failed in repository_after: %d/%d passed", afterResult.NumPassed, afterResult.NumTests)
		report.Error = &errMsg
		report.Comparison.ImprovementSummary = errMsg
	}

	// Create report directory
	dateDir := time.Now().Format("2006-01-02")
	timeDir := time.Now().Format("15-04-05")
	reportDir := filepath.Join("evaluation", "reports", dateDir, timeDir)
	if err := os.MkdirAll(reportDir, 0755); err != nil {
		fmt.Printf("Error creating report directory: %v\n", err)
		os.Exit(1)
	}

	// Write report
	reportPath := filepath.Join(reportDir, "report.json")
	reportJSON, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Printf("Error marshaling report: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(reportPath, reportJSON, 0644); err != nil {
		fmt.Printf("Error writing report: %v\n", err)
		os.Exit(1)
	}

	// Print summary
	fmt.Println("\n" + string(make([]byte, 50)))
	fmt.Println("EVALUATION SUMMARY")
	fmt.Println(string(make([]byte, 50)))
	fmt.Printf("Run ID: %s\n", runID)
	fmt.Printf("Duration: %.2f seconds\n", report.DurationSeconds)
	fmt.Printf("\nBefore Tests: %s\n", formatTestResult(beforeResult))
	fmt.Printf("After Tests: %s\n", formatTestResult(afterResult))
	fmt.Printf("\nOverall Success: %v\n", report.Success)
	fmt.Printf("Report saved to: %s\n", reportPath)

	if !report.Success {
		os.Exit(1)
	}
}

func runTests(repoPath string) TestStatus {
	result := TestStatus{
		Passed: false,
	}

	// Check if repository exists and has code
	_, err := os.Stat(repoPath)
	if os.IsNotExist(err) {
		result.Output = "Repository directory does not exist"
		result.ReturnCode = 1
		return result
	}

	// Check if repository has any Go files
	hasGoFiles := false
	filepath.Walk(repoPath, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && filepath.Ext(path) == ".go" {
			hasGoFiles = true
			return filepath.SkipDir
		}
		return nil
	})

	if !hasGoFiles {
		result.Output = "No Go files found in repository (empty or scaffold)"
		result.ReturnCode = 1
		result.NumTests = 0
		result.NumPassed = 0
		result.NumFailed = 0
		return result
	}

	// Run tests
	var stdout, stderr bytes.Buffer
	
	// Run unit tests
	cmd := exec.Command("go", "test", "-v", "-count=1", "./tests/unit/...", "./tests/integration/...", "./tests/jepsen/...")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.Env = append(os.Environ(), "GO111MODULE=on")
	
	err = cmd.Run()
	
	output := stdout.String() + stderr.String()
	result.Output = truncateOutput(output, 5000)
	
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ReturnCode = exitErr.ExitCode()
		} else {
			result.ReturnCode = 1
		}
	} else {
		result.ReturnCode = 0
		result.Passed = true
	}

	// Count tests
	result.NumTests, result.NumPassed, result.NumFailed = countTests(output)

	return result
}

func countTests(output string) (total, passed, failed int) {
	// Simple parsing of go test output
	lines := bytes.Split([]byte(output), []byte("\n"))
	for _, line := range lines {
		lineStr := string(line)
		if bytes.Contains(line, []byte("--- PASS:")) {
			passed++
			total++
		} else if bytes.Contains(line, []byte("--- FAIL:")) {
			failed++
			total++
		} else if bytes.Contains(line, []byte("=== RUN")) {
			// Could count RUNs too but PASS/FAIL is more accurate
			_ = lineStr
		}
	}
	return
}

func formatTestResult(result TestStatus) string {
	status := "FAILED"
	if result.Passed {
		status = "PASSED"
	}
	return fmt.Sprintf("%s (%d/%d tests passed)", status, result.NumPassed, result.NumTests)
}

func truncateOutput(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n... (output truncated)"
}