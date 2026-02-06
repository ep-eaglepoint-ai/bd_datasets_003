package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"
)

// Report structures matching the exact format provided
type Report struct {
	RunID           string                 `json:"run_id"`
	StartedAt       string                 `json:"started_at"`
	FinishedAt      string                 `json:"finished_at"`
	DurationSeconds float64                `json:"duration_seconds"`
	Environment     map[string]interface{} `json:"environment"`
	Before          TestResult             `json:"before"`
	After           TestResult             `json:"after"`
	Comparison      Comparison             `json:"comparison"`
	Success         bool                   `json:"success"`
	Error           *string                `json:"error"`
}

type TestResult struct {
	Tests   TestStats              `json:"tests"`
	Metrics map[string]interface{} `json:"metrics"`
}

type TestStats struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

type Comparison struct {
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

func main() {
	start := time.Now()

	// Generate a run ID (using timestamp for uniqueness)
	runID := fmt.Sprintf("%d-%s", start.Unix(), "consistent-hash")

	report := Report{
		RunID:     runID,
		StartedAt: start.Format(time.RFC3339),
		Environment: map[string]interface{}{
			"go_version": runtime.Version(),
			"platform":   runtime.GOOS,
			"arch":       runtime.GOARCH,
			"cpus":       runtime.NumCPU(),
		},
	}

	// 1. Run Tests on "Before" (Expected to fail - repository_before is empty)
	fmt.Println("Running tests on repository_before...")
	beforeRes := runGoTest("./repository_before")
	report.Before.Tests = beforeRes
	report.Before.Metrics = make(map[string]interface{})

	// 2. Run Tests on "After" (Expected to pass - tests directory)
	fmt.Println("Running tests on tests directory...")
	afterRes := runGoTest("./tests")
	report.After.Tests = afterRes
	report.After.Metrics = make(map[string]interface{})

	// 3. Finalize
	end := time.Now()
	report.FinishedAt = end.Format(time.RFC3339)
	report.DurationSeconds = end.Sub(start).Seconds()

	report.Comparison.PassedGate = afterRes.Passed
	if afterRes.Passed && !beforeRes.Passed {
		report.Comparison.ImprovementSummary = "Implementation provides consistent hashing with virtual nodes and passes all verification tests."
	} else if afterRes.Passed {
		report.Comparison.ImprovementSummary = "Tests passed successfully."
	} else {
		report.Comparison.ImprovementSummary = "Tests failed."
	}

	report.Success = afterRes.Passed

	// Write Report
	writeReport(report)

	if report.Success {
		fmt.Println("\n✓ Evaluation completed successfully!")
	} else {
		fmt.Println("\n✗ Evaluation failed - tests did not pass")
		os.Exit(1)
	}
}

func runGoTest(dir string) TestStats {
	var cmd *exec.Cmd

	// For tests directory, we need to cd into it first since it has its own go.mod
	if dir == "./tests" {
		cmd = exec.Command("sh", "-c", "cd tests && go test -v .")
	} else {
		cmd = exec.Command("go", "test", "-v", dir)
	}

	output, err := cmd.CombinedOutput()

	passed := err == nil
	code := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			code = exitError.ExitCode()
		} else {
			code = 1
		}
	}

	outputStr := string(output)
	// Truncate output if too long (keep first 500 chars)
	if len(outputStr) > 500 {
		outputStr = outputStr[:500] + "..."
	}

	return TestStats{
		Passed:     passed,
		ReturnCode: code,
		Output:     outputStr,
	}
}

func writeReport(r Report) {
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		panic(err)
	}
	err = os.WriteFile("evaluation/report.json", data, 0644)
	if err != nil {
		panic(err)
	}
	fmt.Println("\n📄 Report generated at: evaluation/report.json")
}
