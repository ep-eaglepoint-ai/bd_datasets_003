package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/google/uuid"
)

type TestResult struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

type Environment struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
}

type BeforeAfter struct {
	Tests   TestResult             `json:"tests"`
	Metrics map[string]interface{} `json:"metrics"`
}

type Comparison struct {
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

type Report struct {
	RunID       string      `json:"run_id"`
	StartedAt   string      `json:"started_at"`
	FinishedAt  string      `json:"finished_at"`
	Duration    float64     `json:"duration_seconds"`
	Environment Environment `json:"environment"`
	Before      BeforeAfter `json:"before"`
	After       BeforeAfter `json:"after"`
	Comparison  Comparison  `json:"comparison"`
	Success     bool        `json:"success"`
	Error       *string     `json:"error"`
}

func main() {
	runID := uuid.New().String()
	startTime := time.Now()

	fmt.Println("=== Docker Socket Proxy Evaluation ===")
	fmt.Printf("Run ID: %s\n", runID)
	fmt.Printf("Started at: %s\n", startTime.Format(time.RFC3339))

	// Get environment info
	env := Environment{
		GoVersion: runtime.Version(),
		Platform:  fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH),
	}

	// Run tests on repository_before (should fail or have no code)
	fmt.Println("\n--- Testing repository_before ---")
	beforeResult := runTests("repository_before")

	// Run tests on repository_after (should pass)
	fmt.Println("\n--- Testing repository_after ---")
	afterResult := runTests("repository_after")

	endTime := time.Now()
	duration := endTime.Sub(startTime).Seconds()

	// Determine success
	success := afterResult.Passed
	passedGate := !beforeResult.Passed && afterResult.Passed

	var errorMsg *string
	if !success {
		msg := "Tests failed on repository_after"
		errorMsg = &msg
	}

	summary := ""
	if passedGate {
		summary = "All tests pass on repository_after, demonstrating successful implementation"
	} else if success {
		summary = "Tests pass on repository_after"
	} else {
		summary = "Tests failed - implementation incomplete"
	}

	report := Report{
		RunID:       runID,
		StartedAt:   startTime.Format(time.RFC3339),
		FinishedAt:  endTime.Format(time.RFC3339),
		Duration:    duration,
		Environment: env,
		Before: BeforeAfter{
			Tests:   beforeResult,
			Metrics: make(map[string]interface{}),
		},
		After: BeforeAfter{
			Tests:   afterResult,
			Metrics: make(map[string]interface{}),
		},
		Comparison: Comparison{
			PassedGate:         passedGate,
			ImprovementSummary: summary,
		},
		Success: success,
		Error:   errorMsg,
	}

	// Save report
	if err := saveReport(report); err != nil {
		fmt.Printf("Error saving report: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("\n=== Evaluation Complete ===\n")
	fmt.Printf("Duration: %.2f seconds\n", duration)
	fmt.Printf("Success: %v\n", success)
	fmt.Printf("Report saved to evaluation/reports/\n")

	if !success {
		os.Exit(1)
	}
}

func runTests(repoPath string) TestResult {
	// Check if repository exists and has Go files
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		return TestResult{
			Passed:     false,
			ReturnCode: 1,
			Output:     fmt.Sprintf("Repository path %s does not exist", repoPath),
		}
	}

	// Check if repository has any .go files
	files, _ := filepath.Glob(filepath.Join(repoPath, "*.go"))
	if len(files) == 0 {
		return TestResult{
			Passed:     false,
			ReturnCode: 1,
			Output:     "No Go files found in repository_before - empty repository (expected for new feature)",
		}
	}

	// Run go test from root directory
	cmd := exec.Command("go", "test", "./tests/...", "-v")
	cmd.Dir = "." // Run from root where go.mod is
	output, err := cmd.CombinedOutput()

	returnCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			returnCode = exitErr.ExitCode()
		} else {
			returnCode = 1
		}
	}

	passed := returnCode == 0

	// Truncate output if too long
	outputStr := string(output)
	if len(outputStr) > 5000 {
		outputStr = outputStr[:5000] + "\n... (truncated)"
	}

	return TestResult{
		Passed:     passed,
		ReturnCode: returnCode,
		Output:     outputStr,
	}
}

func saveReport(report Report) error {
	// Create reports directory structure
	now := time.Now()
	dateDir := now.Format("2006-01-02")
	timeDir := now.Format("15-04-05")
	reportsDir := filepath.Join("evaluation", "reports", dateDir, timeDir)

	if err := os.MkdirAll(reportsDir, 0755); err != nil {
		return fmt.Errorf("failed to create reports directory: %v", err)
	}

	// Save JSON report
	reportPath := filepath.Join(reportsDir, "report.json")
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal report: %v", err)
	}

	if err := os.WriteFile(reportPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write report: %v", err)
	}

	fmt.Printf("Report saved to: %s\n", reportPath)
	return nil
}