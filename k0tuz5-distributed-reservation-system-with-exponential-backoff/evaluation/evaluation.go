package main

import (
	"bytes"
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

type Report struct {
	RunID           string      `json:"run_id"`
	StartedAt       string      `json:"started_at"`
	FinishedAt      string      `json:"finished_at"`
	DurationSeconds float64     `json:"duration_seconds"`
	Environment     Environment `json:"environment"`
	Before          PhaseResult `json:"before"`
	After           PhaseResult `json:"after"`
	Comparison      Comparison  `json:"comparison"`
	Success         bool        `json:"success"`
	Error           string      `json:"error,omitempty"`
}

type PhaseResult struct {
	Tests   TestResult        `json:"tests"`
	Metrics map[string]string `json:"metrics"`
}

type Comparison struct {
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

type Environment struct {
	GoVersion string `json:"go_version"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
	CPUs      int    `json:"cpus"`
}

func getEnvironmentInfo() Environment {
	return Environment{
		GoVersion: runtime.Version(),
		OS:        runtime.GOOS,
		Arch:      runtime.GOARCH,
		CPUs:      runtime.NumCPU(),
	}
}

func runTests(target string) TestResult {
	cmd := exec.Command("go", "test", "./tests", "-v", "-count=1")

	if target == "before" {
		fmt.Println("setting test target: before")
		os.Setenv("TEST_TARGET", "before")
	} else if target == "after" {
		os.Setenv("TEST_TARGET", "after")
	}

	wd, _ := os.Getwd()
	var RepoRoot string
	if strings.HasSuffix(wd, "tests") {
		RepoRoot = filepath.Dir(wd)
	} else {
		RepoRoot = wd
	}
	cmd.Dir = filepath.Join(RepoRoot)

	cmd.Env = append(os.Environ(),
		"CI=true",
		"TEST_TARGET="+target,
		fmt.Sprintf("REPO_PATH=%s", target),
	)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	fmt.Println("Running tests in", cmd.Dir)
	err := cmd.Run()

	output := stdout.String()
	if stderr.Len() > 0 {
		output += "\n" + stderr.String()
	}

	passed := err == nil
	exitCode := 0

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			fmt.Println("Error running tests:", err)
			exitCode = 1
		}
	}

	return TestResult{
		Passed:     passed,
		ReturnCode: exitCode,
		Output: func() string {
			if passed {
				return "All tests passed."
			}
			return output
		}(),
	}
}

func main() {
	root, err := filepath.Abs("")
	if err != nil {
		panic(err)
	}

	reportsDir := filepath.Join(root, "evaluation", "reports")
	if err := os.MkdirAll(reportsDir, 0755); err != nil {
		panic(err)
	}

	runID := uuid.New().String()
	startTime := time.Now()

	fmt.Println("Starting evaluation:", runID)

	fmt.Println("Running baseline tests (before)...")
	before := runTests("before")

	fmt.Println("Running Full stack implementation tests (after)...")
	after := runTests("after")

	endTime := time.Now()

	summary := "No improvement detected."
	if !before.Passed && after.Passed {
		summary = "Implementation passed tests and met requirements."
	} else if before.Passed && after.Passed {
		summary = "Tests passed in both states (verify baseline expectation)."
	} else if !after.Passed {
		summary = "Implementation failed to pass requirements."
	}

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339),
		FinishedAt:      endTime.Format(time.RFC3339),
		DurationSeconds: endTime.Sub(startTime).Seconds(),
		Environment:     getEnvironmentInfo(),
		Before: PhaseResult{
			Tests:   before,
			Metrics: map[string]string{},
		},
		After: PhaseResult{
			Tests:   after,
			Metrics: map[string]string{},
		},
		Comparison: Comparison{
			PassedGate:         after.Passed,
			ImprovementSummary: summary,
		},
		Success: after.Passed,
	}

	reportPath := filepath.Join(reportsDir, "report.json")
	data, _ := json.MarshalIndent(report, "", "  ")
	_ = os.WriteFile(reportPath, data, 0644)

	fmt.Println("Evaluation complete. Success:", report.Success)
	fmt.Println("Report written to:", reportPath)

	if report.Success {
		os.Exit(0)
	}
	os.Exit(1)
}
