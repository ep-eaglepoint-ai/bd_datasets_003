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

type TestResult struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

type EnvInfo struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
	Arch      string `json:"arch"`
	CPUs      int    `json:"cpus"`
}

type Report struct {
	RunID           string  `json:"run_id"`
	StartedAt       string  `json:"started_at"`
	FinishedAt      string  `json:"finished_at"`
	DurationSeconds float64 `json:"duration_seconds"`
	Environment     EnvInfo `json:"environment"`
	Before          struct {
		Tests TestResult `json:"tests"`
	} `json:"before"`
	After struct {
		Tests TestResult `json:"tests"`
	} `json:"after"`
	Comparison struct {
		PassedGate         bool   `json:"passed_gate"`
		ImprovementSummary string `json:"improvement_summary"`
	} `json:"comparison"`
	Success bool `json:"success"`
}

func getEnvInfo() EnvInfo {
	return EnvInfo{
		GoVersion: runtime.Version(),
		Platform:  runtime.GOOS,
		Arch:      runtime.GOARCH,
		CPUs:      runtime.NumCPU(),
	}
}

func runTests(tag string) TestResult {
	// We run tests using the specific build tag to toggle before/after
	// -bench=. and -benchmem are included to ensure performance metrics are captured
	args := []string{"test", "-v", "-bench=.", "-benchmem", "-race"}
	if tag != "" {
		args = append(args, "-tags="+tag)
	}
	args = append(args, "./tests/...")

	cmd := exec.Command("go", args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()

	returnCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			returnCode = exitError.ExitCode()
		} else {
			returnCode = 1
		}
	}

	output := out.String()
	// Truncate output to 1000 chars for the report
	if len(output) > 1000 {
		output = output[:1000]
	}

	return TestResult{
		Passed:     err == nil,
		ReturnCode: returnCode,
		Output:     output,
	}
}

func main() {
	runID := uuid.New().String()
	startTime := time.Now()
	fmt.Printf("Starting evaluation (Run ID: %s)...\n", runID)

	// 1. Run Baseline Tests
	fmt.Println("Running baseline tests (before)...")
	beforeResult := runTests("before")

	// 2. Run Refactor Tests
	fmt.Println("Running refactor tests (after)...")
	afterResult := runTests("after")

	endTime := time.Now()
	duration := endTime.Sub(startTime).Seconds()

	// 3. Improvement Summary Logic
	summary := "No improvement detected."
	if !beforeResult.Passed && afterResult.Passed {
		summary = "Refactor fixed failing tests and met requirements."
	} else if beforeResult.Passed && afterResult.Passed {
		summary = "Tests passed in both states (Verify baseline expectation)."
	} else if !afterResult.Passed {
		summary = "Refactored code failed to pass requirements."
	}

	// 4. Construct Final Report
	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339Nano),
		FinishedAt:      endTime.Format(time.RFC3339Nano),
		DurationSeconds: duration,
		Environment:     getEnvInfo(),
		Success:         afterResult.Passed,
	}
	report.Before.Tests = beforeResult
	report.After.Tests = afterResult
	report.Comparison.PassedGate = afterResult.Passed
	report.Comparison.ImprovementSummary = summary

	// Ensure directory exists
	reportDir := filepath.Join("evaluation", "reports")
	_ = os.MkdirAll(reportDir, 0755)

	// Write JSON
	reportPath := filepath.Join(reportDir, "report.json")
	file, _ := json.MarshalIndent(report, "", "  ")
	_ = os.WriteFile(reportPath, file, 0644)

	fmt.Printf("Evaluation complete. Success: %v\n", report.Success)
	fmt.Printf("Report written to: %s\n", reportPath)

	if !report.Success {
		os.Exit(1)
	}
}
