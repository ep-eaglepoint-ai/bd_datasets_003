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

	Before *struct{} `json:"before"`

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

func runAfterTests() TestResult {
	args := []string{
		"test",
		"-v",
		"-count=1",
		"./tests",
	}

	cmd := exec.Command("go", args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()

	returnCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			returnCode = exitErr.ExitCode()
		} else {
			returnCode = 1
		}
	}

	output := out.String()
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

	afterResult := runAfterTests()

	endTime := time.Now()
	duration := endTime.Sub(startTime).Seconds()

	summary := "After tests failed."
	if afterResult.Passed {
		summary = "All after tests passed."
	}

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339Nano),
		FinishedAt:      endTime.Format(time.RFC3339Nano),
		DurationSeconds: duration,
		Environment:     getEnvInfo(),

		Before:  &struct{}{},
		Success: afterResult.Passed,
	}

	report.After.Tests = afterResult
	report.Comparison.PassedGate = afterResult.Passed
	report.Comparison.ImprovementSummary = summary

	reportDir := filepath.Join("evaluation", "reports")
	_ = os.MkdirAll(reportDir, 0755)

	reportPath := filepath.Join(reportDir, "report.json")
	data, _ := json.MarshalIndent(report, "", "  ")
	_ = os.WriteFile(reportPath, data, 0644)

	fmt.Printf("Evaluation complete. Success: %v\n", report.Success)
	fmt.Printf("Report written to: %s\n", reportPath)

	if !report.Success {
		os.Exit(1)
	}
}
