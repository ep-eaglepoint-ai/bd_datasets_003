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

const reportsDir = "evaluation/reports"

type Environment struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
}

type TestResult struct {
	Passed       bool   `json:"passed"`
	ReturnCode   int    `json:"return_code"`
	TestsPassed  int    `json:"tests_passed"`
	TestsFailed  int    `json:"tests_failed"`
	Output       string `json:"output"`
}

type StageResult struct {
	Tests   TestResult `json:"tests"`
	Metrics struct{}   `json:"metrics"`
}

type Comparison struct {
	BeforePassed       bool   `json:"before_passed"`
	AfterPassed        bool   `json:"after_passed"`
	BeforeFailedCount  int    `json:"before_failed_count"`
	AfterFailedCount   int    `json:"after_failed_count"`
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

type Report struct {
	RunID           string      `json:"run_id"`
	StartedAt       string      `json:"started_at"`
	FinishedAt      string      `json:"finished_at"`
	DurationSeconds float64     `json:"duration_seconds"`
	Environment     Environment `json:"environment"`
	Before          *StageResult `json:"before"` // Use pointer to allow null
	After           StageResult `json:"after"`
	Comparison      Comparison  `json:"comparison"`
	Success         bool        `json:"success"`
	Error           *string     `json:"error"`
}

func main() {
	start := time.Now()
	runID := uuid.New().String()

	fmt.Println("======================================================================")
	fmt.Println("  WEBHOOK DELIVERY SYSTEM EVALUATION (GO)")
	fmt.Println("======================================================================")
	fmt.Printf("\n  Run ID:     %s\n", runID)
	fmt.Printf("  Started:    %s\n", start.Format(time.RFC3339))
	fmt.Printf("  Go:         %s\n", runtime.Version())
	fmt.Printf("  Platform:   %s-%s\n", runtime.GOOS, runtime.GOARCH)

	// Stubbed "before" results (as per previous JS logic)
	fmt.Println("\n  [1/2] Testing repository_before (skipped - empty)...")
	beforeResult := TestResult{
		Passed:      false,
		ReturnCode:  1,
		TestsPassed: 0,
		TestsFailed: 29, // Matches previous logic
		Output:      "FAIL repository_before",
	}
	beforeStage := &StageResult{
		Tests:   beforeResult,
		Metrics: struct{}{},
	}
	// Per request, "before" should be object with failed status, not null? 
    // Request says "before": { "tests": { "passed": false ... } } so we keep it.

	// Run "after" tests
	fmt.Println("\n  [2/2] Testing repository_after...")
	afterResult := runTests("after")
	afterStage := StageResult{
		Tests:   afterResult,
		Metrics: struct{}{},
	}

	comparison := Comparison{
		BeforePassed:      false,
		AfterPassed:       afterResult.Passed,
		BeforeFailedCount: beforeResult.TestsFailed,
		AfterFailedCount:  afterResult.TestsFailed,
		PassedGate:        afterResult.Passed,
	}

	if comparison.PassedGate {
		comparison.ImprovementSummary = fmt.Sprintf("Optimization successful: repository_after passes %d tests.", afterResult.TestsPassed)
	} else {
		comparison.ImprovementSummary = "Failed: repository_after has failures or errors."
	}

	end := time.Now()
	duration := end.Sub(start).Seconds()

	report := Report{
		RunID:           runID,
		StartedAt:       start.Format(time.RFC3339),
		FinishedAt:      end.Format(time.RFC3339),
		DurationSeconds: duration,
		Environment: Environment{
			GoVersion: runtime.Version(),
			Platform:  fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH),
		},
		Before:     beforeStage,
		After:      afterStage,
		Comparison: comparison,
		Success:    comparison.PassedGate,
		Error:      nil,
	}

	saveReport(report, start)

	printSummary(report)

	if !report.Success {
		os.Exit(1)
	}
}

func runTests(stage string) TestResult {
	// Tests are in /app/tests inside container
	cwd := "/app/tests"
	if _, err := os.Stat(cwd); os.IsNotExist(err) {
		// Fallback for local testing
		cwd = "../tests"
		if _, err := os.Stat(cwd); os.IsNotExist(err) {
			return TestResult{
				Passed: false,
				ReturnCode: 1,
				Output: fmt.Sprintf("Test directory not found: %s", cwd),
			}
		}
	}

	cmd := exec.Command("go", "test", "-v", "./...")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "CGO_ENABLED=1")

	fmt.Printf("  Command: go test -v ./...\n")
	fmt.Printf("  CWD: %s\n", cwd)

	outputBytes, err := cmd.CombinedOutput()
	output := string(outputBytes)
	fmt.Println(output)

	returnCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			returnCode = exitError.ExitCode()
		} else {
			returnCode = 1
		}
	}

	passed, failed := parseTestOutput(output)

	// Go test returns 0 on success, non-zero on failure
	success := returnCode == 0

	return TestResult{
		Passed:      success,
		ReturnCode:  returnCode,
		TestsPassed: passed,
		TestsFailed: failed,
		Output:      limitString(output, 50000),
	}
}

func parseTestOutput(output string) (int, int) {
	// Simple parsing for now
	passed := strings.Count(output, "--- PASS:")
	failed := strings.Count(output, "--- FAIL:")
	return passed, failed
}

func saveReport(report Report, start time.Time) {
	dateStr := start.Format("2006-01-02")
	timeStr := start.Format("15-04-05")
	reportPath := filepath.Join(reportsDir, dateStr, timeStr)

	if err := os.MkdirAll(reportPath, 0755); err != nil {
		fmt.Printf("Error creating report dir: %v\n", err)
		return
	}

	filename := filepath.Join(reportPath, "report.json")
	file, err := os.Create(filename)
	if err != nil {
		fmt.Printf("Error creating report file: %v\n", err)
		return
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		fmt.Printf("Error writing report: %v\n", err)
	} else {
		fmt.Printf("\n  Report saved to: %s\n", filename)
	}
}

func printSummary(report Report) {
	fmt.Println("\n======================================================================")
	fmt.Println("  RESULTS SUMMARY")
	fmt.Println("======================================================================")

	printStage("repository_before (unoptimized)", report.Before.Tests)
	printStage("repository_after (optimized)", report.After.Tests)

	fmt.Println("\n======================================================================")
	fmt.Println("  COMPARISON")
	fmt.Println("======================================================================")
	
	gateStatus := "FAILED"
	if report.Success {
		gateStatus = "PASSED"
	}
	fmt.Printf("\n  Optimization Gate:     %s\n", gateStatus)
	fmt.Printf("  Summary: %s\n", report.Comparison.ImprovementSummary)
	
	fmt.Println("\n======================================================================")
	if report.Success {
		fmt.Println("  ✅ EVALUATION SUCCESSFUL ✅")
	} else {
		fmt.Println("  ❌ EVALUATION FAILED ❌")
	}
	fmt.Println("======================================================================\n")
}

func printStage(name string, result TestResult) {
	fmt.Println("\n-----------------------------------")
	fmt.Printf("  %s\n", name)
	fmt.Println("-----------------------------------")
	
	status := "❌ FAIL"
	if result.Passed {
		status = "✅ PASS"
	}
	fmt.Printf("  Status:          %s\n", status)
	fmt.Printf("  Tests Passed:    %d\n", result.TestsPassed)
	fmt.Printf("  Tests Failed:    %d\n", result.TestsFailed)
	fmt.Printf("  Return Code:     %d\n", result.ReturnCode)
}

func limitString(s string, limit int) string {
	if len(s) > limit {
		return s[:limit]
	}
	return s
}
