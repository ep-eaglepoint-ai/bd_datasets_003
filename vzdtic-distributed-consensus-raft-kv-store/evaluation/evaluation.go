package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
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

type TestPhase struct {
	Tests   TestResult         `json:"tests"`
	Metrics map[string]float64 `json:"metrics"`
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
	Before      TestPhase   `json:"before"`
	After       TestPhase   `json:"after"`
	Comparison  Comparison  `json:"comparison"`
	Success     bool        `json:"success"`
	Error       *string     `json:"error"`
}

func main() {
	fmt.Println("Running Raft KV Store Evaluation...")
	fmt.Println("=" + strings.Repeat("=", 50))

	runID := uuid.New().String()
	startTime := time.Now()

	// Get environment info
	goVersion := runtime.Version()
	platform := fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH)

	report := Report{
		RunID:     runID,
		StartedAt: startTime.Format(time.RFC3339),
		Environment: Environment{
			GoVersion: goVersion,
			Platform:  platform,
		},
		Before: TestPhase{
			Tests: TestResult{
				Passed:     false,
				ReturnCode: 0,
				Output:     "No repository_before found - skipping before tests",
			},
			Metrics: make(map[string]float64),
		},
		After: TestPhase{
			Metrics: make(map[string]float64),
		},
		Success: true,
		Error:   nil,
	}

	// Run tests on repository_after
	fmt.Println("\nRunning tests on repository_after...")
	fmt.Println("-" + strings.Repeat("-", 50))

	testStartTime := time.Now()
	cmd := exec.Command("go", "test", "-v", "./tests/...")
	output, err := cmd.CombinedOutput()
	testDuration := time.Since(testStartTime)

	returnCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			returnCode = exitError.ExitCode()
		} else {
			returnCode = 1
		}
	}

	// Work with full output for counting
	fullOutput := string(output)
	totalTests := float64(countTests(fullOutput))
	passedTests := float64(countPassedTests(fullOutput))
	failedTests := float64(countFailedTests(fullOutput))
	skippedTests := float64(countSkippedTests(fullOutput))

	// Create a condensed summary for the report
	summary := createTestSummary(fullOutput)
	
	// Store summary + truncated detailed output
	outputForReport := summary
	if len(fullOutput) > 50000 {
		outputForReport += "\n\nDetailed Output (truncated):\n" + fullOutput[:50000] + "\n... (output truncated, see full output file)"
	} else {
		outputForReport += "\n\nDetailed Output:\n" + fullOutput
	}

	report.After.Tests = TestResult{
		Passed:     returnCode == 0,
		ReturnCode: returnCode,
		Output:     outputForReport,
	}

	// Calculate metrics
	report.After.Metrics["test_duration_seconds"] = testDuration.Seconds()
	report.After.Metrics["total_tests"] = totalTests
	report.After.Metrics["passed_tests"] = passedTests
	report.After.Metrics["failed_tests"] = failedTests
	report.After.Metrics["skipped_tests"] = skippedTests

	// Set comparison
	if report.After.Tests.Passed && failedTests == 0 {
		if skippedTests > 0 {
			report.Comparison = Comparison{
				PassedGate:         true,
				ImprovementSummary: fmt.Sprintf("All tests passed successfully (%.0f passed, %.0f skipped). Raft consensus implementation is working correctly.", passedTests, skippedTests),
			}
		} else {
			report.Comparison = Comparison{
				PassedGate:         true,
				ImprovementSummary: "All tests passed successfully. Raft consensus implementation is working correctly.",
			}
		}
		report.Success = true
	} else {
		if failedTests > 0 {
			report.Comparison = Comparison{
				PassedGate:         false,
				ImprovementSummary: fmt.Sprintf("%.0f test(s) failed. Implementation needs fixes.", failedTests),
			}
		} else {
			report.Comparison = Comparison{
				PassedGate:         false,
				ImprovementSummary: "Tests did not complete successfully.",
			}
		}
		report.Success = false
	}

	// Finish timing
	finishTime := time.Now()
	report.FinishedAt = finishTime.Format(time.RFC3339)
	report.Duration = finishTime.Sub(startTime).Seconds()

	// Create report directory
	reportDir := filepath.Join("evaluation", "reports",
		finishTime.Format("2006-01-02"),
		finishTime.Format("15-04-05"))

	if err := os.MkdirAll(reportDir, 0755); err != nil {
		errMsg := fmt.Sprintf("Failed to create report directory: %v", err)
		report.Error = &errMsg
		report.Success = false
		fmt.Printf("ERROR: %s\n", errMsg)
	}

	// Write report
	reportPath := filepath.Join(reportDir, "report.json")
	reportData, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		errMsg := fmt.Sprintf("Failed to marshal report: %v", err)
		report.Error = &errMsg
		report.Success = false
		fmt.Printf("ERROR: %s\n", errMsg)
	}

	if err := os.WriteFile(reportPath, reportData, 0644); err != nil {
		errMsg := fmt.Sprintf("Failed to write report: %v", err)
		report.Error = &errMsg
		report.Success = false
		fmt.Printf("ERROR: %s\n", errMsg)
	}

	// Print summary
	fmt.Println()
	fmt.Println("Evaluation Summary")
	fmt.Println("=" + strings.Repeat("=", 50))
	fmt.Printf("Run ID:           %s\n", report.RunID)
	fmt.Printf("Started:          %s\n", report.StartedAt)
	fmt.Printf("Finished:         %s\n", report.FinishedAt)
	fmt.Printf("Duration:         %.2fs\n", report.Duration)
	fmt.Printf("Go Version:       %s\n", report.Environment.GoVersion)
	fmt.Printf("Platform:         %s\n", report.Environment.Platform)
	fmt.Println()
	fmt.Println("After Tests:")
	fmt.Printf("  Total:          %.0f\n", report.After.Metrics["total_tests"])
	fmt.Printf("  Passed:         %.0f\n", report.After.Metrics["passed_tests"])
	fmt.Printf("  Failed:         %.0f\n", report.After.Metrics["failed_tests"])
	fmt.Printf("  Skipped:        %.0f\n", report.After.Metrics["skipped_tests"])
	fmt.Printf("  Return Code:    %d\n", report.After.Tests.ReturnCode)
	fmt.Printf("  Status:         %v\n", report.After.Tests.Passed)
	fmt.Println()
	
	// Print test summary
	fmt.Println("Test Results:")
	fmt.Println(summary)
	fmt.Println()
	
	fmt.Println("Comparison:")
	fmt.Printf("  Passed Gate:    %v\n", report.Comparison.PassedGate)
	fmt.Printf("  Summary:        %s\n", report.Comparison.ImprovementSummary)
	fmt.Println()
	fmt.Printf("Overall Success:  %v\n", report.Success)
	fmt.Println()
	fmt.Printf("Report saved to:      %s\n", reportPath)
	

	// Verify math
	calculatedTotal := passedTests + failedTests + skippedTests
	if calculatedTotal != totalTests {
		fmt.Printf("\nWARNING: Test count mismatch - Total: %.0f, Passed+Failed+Skipped: %.0f\n",
			totalTests, calculatedTotal)
	}

	if !report.Success {
		fmt.Println("\n" + strings.Repeat("=", 50))
		fmt.Println("EVALUATION FAILED")
		fmt.Println(strings.Repeat("=", 50))
		os.Exit(1)
	}

	fmt.Println("\n" + strings.Repeat("=", 50))
	fmt.Println("EVALUATION PASSED")
	fmt.Println(strings.Repeat("=", 50))
}

func createTestSummary(output string) string {
	var summary strings.Builder
	summary.WriteString("Test Summary:\n")
	summary.WriteString(strings.Repeat("-", 50) + "\n")

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		// Include test run headers and results
		if strings.HasPrefix(line, "=== RUN") ||
			strings.Contains(line, "--- PASS:") ||
			strings.Contains(line, "--- FAIL:") ||
			strings.Contains(line, "--- SKIP:") ||
			strings.HasPrefix(line, "PASS") ||
			strings.HasPrefix(line, "FAIL") ||
			strings.HasPrefix(line, "ok") {
			summary.WriteString(line + "\n")
		}
		// Include error messages and test output (lines starting with spaces)
		if strings.Contains(line, "    ") && (strings.Contains(line, "Error") || 
			strings.Contains(line, "FAIL") || 
			strings.Contains(line, ":")) {
			summary.WriteString(line + "\n")
		}
	}

	return summary.String()
}

func countTests(output string) int {
	count := 0
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "=== RUN") {
			count++
		}
	}
	return count
}

func countPassedTests(output string) int {
	count := 0
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.Contains(line, "--- PASS:") {
			count++
		}
	}
	return count
}

func countFailedTests(output string) int {
	count := 0
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.Contains(line, "--- FAIL:") {
			count++
		}
	}
	return count
}

func countSkippedTests(output string) int {
	count := 0
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.Contains(line, "--- SKIP:") {
			count++
		}
	}
	return count
}