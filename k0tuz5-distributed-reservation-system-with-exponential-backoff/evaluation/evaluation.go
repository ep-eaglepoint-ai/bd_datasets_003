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

// --- Types for the Report ---

type EnvInfo struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
	Arch      string `json:"arch"`
	CPUs      int    `json:"cpus"`
}

type TestResult struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

type Report struct {
	RunID           string      `json:"run_id"`
	StartedAt       string      `json:"started_at"`
	FinishedAt      string      `json:"finished_at"`
	DurationSeconds float64     `json:"duration_seconds"`
	Environment     EnvInfo     `json:"environment"`
	Before          StateResult `json:"before"`
	After           StateResult `json:"after"`
	Comparison      Comparison  `json:"comparison"`
	Success         bool        `json:"success"`
	Error           interface{} `json:"error"`
}

type StateResult struct {
	Tests   TestResult             `json:"tests"`
	Metrics map[string]interface{} `json:"metrics"`
}

type Comparison struct {
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

// --- Logic ---

func getEnvironmentInfo() EnvInfo {
	return EnvInfo{
		GoVersion: runtime.Version(),
		Platform:  runtime.GOOS,
		Arch:      runtime.GOARCH,
		CPUs:      runtime.NumCPU(),
	}
}

func runTests(root string, repoPath string) TestResult {
    // 1. Change command to 'go test'
    // We target the ./tests/... package relative to the root
	// In evaluation.go before cmd.Run()
	exec.Command("go", "mod", "edit", "-replace", "reservation-system/client=./"+repoPath+"/client").Run()
    cmd := exec.Command("go", "test", "-v", "-json", "./tests/...")
    cmd.Dir = root

    // 2. Set the environment variable so the tests know which folder to target
    cmd.Env = append(os.Environ(),
        "CI=true",
        "REPO_PATH="+repoPath,
    )

    var stdout, stderr bytes.Buffer
    cmd.Stdout = &stdout
    cmd.Stderr = &stderr

    err := cmd.Run()

    // Determine success based on exit code
    returnCode := 0
    if err != nil {
        if exitError, ok := err.(*exec.ExitError); ok {
            returnCode = exitError.ExitCode()
        } else {
            returnCode = 1
        }
    }

    passed := returnCode == 0
    outputStr := stdout.String()

    // Go test -json output is a bit noisy. 
    // If you just want to see if the final result was 'pass':
    if passed && outputStr == "" {
        outputStr = "All Go tests passed."
    }

    // Truncate for the report
    finalOutput := outputStr
    if len(finalOutput) > 1000 {
        finalOutput = finalOutput[:1000]
    }

    return TestResult{
        Passed:     passed,
        ReturnCode: returnCode,
        Output:     finalOutput,
    }
}

func main() {
	// 1. Setup paths
	root, err := os.Getwd()
	if err != nil {
		fmt.Printf("Error getting working directory: %v\n", err)
		os.Exit(1)
	}

	// We want /app/evaluation/reports
	reportsDir := filepath.Join(root, "evaluation", "reports")

	// Ensure directory exists with full permissions
	if _, err := os.Stat(reportsDir); os.IsNotExist(err) {
		err := os.MkdirAll(reportsDir, 0777) // Very permissive for Docker volumes
		if err != nil {
			fmt.Printf("Error creating directory: %v\n", err)
		}
	}
	runID := uuid.New().String()
	startTime := time.Now()

	fmt.Printf("Starting evaluation (Run ID: %s)...\n", runID)

	fmt.Println("Running tests (before)...")
	beforeTests := runTests(root, "repository_before")

	fmt.Println("Running baseline tests (after)...")
	afterTests := runTests(root, "repository_after")

	improvement := "No improvement detected."
	if !beforeTests.Passed && afterTests.Passed {
		improvement = "full stack dev tests passed and met distributed requirements."
	} else if beforeTests.Passed && afterTests.Passed {
		improvement = "Tests passed in both states (Verify baseline expectation)."
	} else if !afterTests.Passed {
		improvement = "Implementated code failed to pass requirements."
	}

	// 4. Construct Report
	endTime := time.Now()
	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339),
		FinishedAt:      endTime.Format(time.RFC3339),
		DurationSeconds: endTime.Sub(startTime).Seconds(),
		Environment:     getEnvironmentInfo(),
		Before: StateResult{
			Tests:   beforeTests,
			Metrics: make(map[string]interface{}),
		},
		After: StateResult{
			Tests:   afterTests,
			Metrics: make(map[string]interface{}),
		},
		Comparison: Comparison{
			PassedGate:         afterTests.Passed,
			ImprovementSummary: improvement,
		},
		Success: afterTests.Passed,
	}

	// 5. Write to File
	reportJSON, _ := json.MarshalIndent(report, "", "  ")
	reportPath := filepath.Join(reportsDir, "report.json")
	err = os.WriteFile(reportPath, reportJSON, 0666)
	if err != nil {
		fmt.Printf("Error writing report: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Evaluation complete. Success: %v\n", report.Success)
	fmt.Printf("Report written to: %s\n", reportPath)

	if !report.Success {
		os.Exit(1)
	}
}
