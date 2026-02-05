package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type TestResult struct {
	Name     string  `json:"name"`
	Status   string  `json:"status"`
	Duration float64 `json:"duration_seconds"`
	Output   string  `json:"output,omitempty"`
}

type Report struct {
	Timestamp    string       `json:"timestamp"`
	TotalTests   int          `json:"total_tests"`
	Passed       int          `json:"passed"`
	Failed       int          `json:"failed"`
	Skipped      int          `json:"skipped"`
	Duration     float64      `json:"total_duration_seconds"`
	TestResults  []TestResult `json:"test_results"`
	Summary      string       `json:"summary"`
}

func main() {
	fmt.Println("Running Raft KV Store Tests...")
	fmt.Println("=" + strings.Repeat("=", 50))

	startTime := time.Now()

	// Run tests with verbose output
	cmd := exec.Command("go", "test", "-v", "-json", "./tests/...")
	output, _ := cmd.CombinedOutput()

	duration := time.Since(startTime)

	// Parse test output
	report := parseTestOutput(string(output), duration)
	report.Timestamp = time.Now().Format(time.RFC3339)

	// Create report directory
	now := time.Now()
	reportDir := filepath.Join("evaluation", "reports", 
		now.Format("2006-01-02"), 
		now.Format("15-04-05"))
	
	if err := os.MkdirAll(reportDir, 0755); err != nil {
		fmt.Printf("Failed to create report directory: %v\n", err)
		os.Exit(1)
	}

	// Write report
	reportPath := filepath.Join(reportDir, "report.json")
	reportData, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Printf("Failed to marshal report: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(reportPath, reportData, 0644); err != nil {
		fmt.Printf("Failed to write report: %v\n", err)
		os.Exit(1)
	}

	// Print summary
	fmt.Println()
	fmt.Println("Test Results Summary")
	fmt.Println("=" + strings.Repeat("=", 50))
	fmt.Printf("Total Tests:  %d\n", report.TotalTests)
	fmt.Printf("Passed:       %d\n", report.Passed)
	fmt.Printf("Failed:       %d\n", report.Failed)
	fmt.Printf("Skipped:      %d\n", report.Skipped)
	fmt.Printf("Duration:     %.2fs\n", report.Duration)
	fmt.Println()
	fmt.Printf("Report saved to: %s\n", reportPath)

	if report.Failed > 0 {
		fmt.Println("\nFailed Tests:")
		for _, result := range report.TestResults {
			if result.Status == "FAIL" {
				fmt.Printf("  - %s\n", result.Name)
			}
		}
		os.Exit(1)
	}

	fmt.Println("\nAll tests passed!")
}

type jsonTestEvent struct {
	Time    string  `json:"Time"`
	Action  string  `json:"Action"`
	Package string  `json:"Package"`
	Test    string  `json:"Test"`
	Output  string  `json:"Output"`
	Elapsed float64 `json:"Elapsed"`
}

func parseTestOutput(output string, totalDuration time.Duration) Report {
	report := Report{
		Duration:    totalDuration.Seconds(),
		TestResults: make([]TestResult, 0),
	}

	testOutputs := make(map[string]string)
	testDurations := make(map[string]float64)
	testStatus := make(map[string]string)

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}

		var event jsonTestEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}

		if event.Test == "" {
			continue
		}

		switch event.Action {
		case "output":
			testOutputs[event.Test] += event.Output
		case "pass":
			testStatus[event.Test] = "PASS"
			testDurations[event.Test] = event.Elapsed
		case "fail":
			testStatus[event.Test] = "FAIL"
			testDurations[event.Test] = event.Elapsed
		case "skip":
			testStatus[event.Test] = "SKIP"
			testDurations[event.Test] = event.Elapsed
		}
	}

	for testName, status := range testStatus {
		result := TestResult{
			Name:     testName,
			Status:   status,
			Duration: testDurations[testName],
		}
		if status == "FAIL" {
			result.Output = testOutputs[testName]
		}
		report.TestResults = append(report.TestResults, result)

		switch status {
		case "PASS":
			report.Passed++
		case "FAIL":
			report.Failed++
		case "SKIP":
			report.Skipped++
		}
	}

	report.TotalTests = len(report.TestResults)
	
	if report.Failed == 0 {
		report.Summary = "All tests passed"
	} else {
		report.Summary = fmt.Sprintf("%d tests failed", report.Failed)
	}

	return report
}