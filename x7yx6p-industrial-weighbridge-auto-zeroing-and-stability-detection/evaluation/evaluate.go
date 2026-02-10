package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/google/uuid"
)

type Report struct {
	RunID          string    `json:"run_id"`
	StartedAt      string    `json:"started_at"`
	FinishedAt     string    `json:"finished_at"`
	DurationSeconds float64  `json:"duration_seconds"`
	Environment    Environment `json:"environment"`
	Before         TestResult `json:"before"`
	After          TestResult `json:"after"`
	Comparison     Comparison `json:"comparison"`
	Success        bool      `json:"success"`
}

type Environment struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
	Arch      string `json:"arch"`
	CPUs      int    `json:"cpus"`
}

type TestResult struct {
	Tests   TestOutput `json:"tests"`
	Metrics map[string]interface{} `json:"metrics"`
}

type TestOutput struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

type Comparison struct {
	PassedGate        bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

func main() {
	startTime := time.Now()
	runID := uuid.New().String()

	// Get environment info
	goVersion := getGoVersion()
	env := Environment{
		GoVersion: goVersion,
		Platform:  runtime.GOOS,
		Arch:      runtime.GOARCH,
		CPUs:      runtime.NumCPU(),
	}

	// Run before tests
	beforeResult := runTests("repository_before")

	// Run after tests
	afterResult := runTests("repository_after")

	// Determine if gate passed
	passedGate := !beforeResult.Tests.Passed && afterResult.Tests.Passed
	improvementSummary := ""
	if passedGate {
		improvementSummary = "Refactor fixed failing tests and met distributed requirements."
	} else if beforeResult.Tests.Passed && afterResult.Tests.Passed {
		improvementSummary = "Both before and after tests passed."
	} else if !beforeResult.Tests.Passed && !afterResult.Tests.Passed {
		improvementSummary = "Both before and after tests failed."
	} else {
		improvementSummary = "After tests failed while before tests passed."
	}

	comparison := Comparison{
		PassedGate:        passedGate,
		ImprovementSummary: improvementSummary,
	}

	finishTime := time.Now()
	duration := finishTime.Sub(startTime).Seconds()

	report := Report{
		RunID:          runID,
		StartedAt:      startTime.Format(time.RFC3339),
		FinishedAt:     finishTime.Format(time.RFC3339),
		DurationSeconds: duration,
		Environment:    env,
		Before:         beforeResult,
		After:          afterResult,
		Comparison:     comparison,
		Success:        afterResult.Tests.Passed,
	}

	// Write report to JSON file
	reportJSON, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error marshaling report: %v\n", err)
		os.Exit(1)
	}

	// Ensure reports directory exists
	err = os.MkdirAll("reports", 0755)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating reports directory: %v\n", err)
		os.Exit(1)
	}

	err = os.WriteFile("reports/report.json", reportJSON, 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error writing report: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Evaluation complete. Report written to reports/report.json")
	if report.Success {
		os.Exit(0)
	} else {
		os.Exit(1)
	}
}

func runTests(repoPath string) TestResult {
	// Change to tests directory
	originalDir, err := os.Getwd()
	if err != nil {
		return TestResult{
			Tests: TestOutput{
				Passed:     false,
				ReturnCode: 1,
				Output:     fmt.Sprintf("Error getting current directory: %v", err),
			},
			Metrics: make(map[string]interface{}),
		}
	}

	// Change to tests directory
	err = os.Chdir("../tests")
	if err != nil {
		return TestResult{
			Tests: TestOutput{
				Passed:     false,
				ReturnCode: 1,
				Output:     fmt.Sprintf("Error changing to tests directory: %v", err),
			},
			Metrics: make(map[string]interface{}),
		}
	}
	defer os.Chdir(originalDir)

	// Copy main.go from repository
	sourcePath := fmt.Sprintf("../%s/main.go", repoPath)
	destPath := "main.go"

	// Check if source file exists
	if _, err := os.Stat(sourcePath); os.IsNotExist(err) {
		return TestResult{
			Tests: TestOutput{
				Passed:     false,
				ReturnCode: 1,
				Output:     fmt.Sprintf("main.go does not exist in /app/%s", repoPath),
			},
			Metrics: make(map[string]interface{}),
		}
	}

	// Copy the file
	input, err := os.ReadFile(sourcePath)
	if err != nil {
		return TestResult{
			Tests: TestOutput{
				Passed:     false,
				ReturnCode: 1,
				Output:     fmt.Sprintf("Error reading %s: %v", sourcePath, err),
			},
			Metrics: make(map[string]interface{}),
		}
	}

	err = os.WriteFile(destPath, input, 0644)
	if err != nil {
		return TestResult{
			Tests: TestOutput{
				Passed:     false,
				ReturnCode: 1,
				Output:     fmt.Sprintf("Error writing %s: %v", destPath, err),
			},
			Metrics: make(map[string]interface{}),
		}
	}

	// Run go test with JSON output
	cmd := exec.Command("go", "test", "-v", "-json", ".")
	output, err := cmd.CombinedOutput()
	returnCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			returnCode = exitError.ExitCode()
		} else {
			returnCode = 1
		}
	}

	passed := returnCode == 0

	return TestResult{
		Tests: TestOutput{
			Passed:     passed,
			ReturnCode: returnCode,
			Output:     string(output),
		},
		Metrics: make(map[string]interface{}),
	}
}

func getGoVersion() string {
	cmd := exec.Command("go", "version")
	output, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	// Output format: "go version go1.18.10 linux/amd64"
	// Extract just the version part
	version := string(output)
	if len(version) > 0 {
		// Remove "go version " prefix and take until first space
		version = version[11:] // "go version " is 11 chars
		for i, char := range version {
			if char == ' ' {
				return version[:i]
			}
		}
		return version[:len(version)-1] // Remove newline
	}
	return "unknown"
}

