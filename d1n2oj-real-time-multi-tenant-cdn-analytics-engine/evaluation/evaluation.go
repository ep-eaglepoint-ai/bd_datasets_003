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

// JSON report structures

type Environment struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
	Arch      string `json:"arch"`
	CPUs      int    `json:"cpus"`
}

type TestSuiteResult struct {
	Name       string  `json:"name"`
	Passed     bool    `json:"passed"`
	Tests      int     `json:"tests"`
	Elapsed    float64 `json:"elapsed_seconds"`
	ReturnCode int     `json:"return_code"`
	Output     string  `json:"output"`
}

type TestPhaseResult struct {
	Passed       bool              `json:"passed"`
	TotalTests   int               `json:"total_tests"`
	PassedTests  int               `json:"passed_tests"`
	FailedTests  int               `json:"failed_tests"`
	Suites       []TestSuiteResult `json:"suites"`
	ReturnCode   int               `json:"return_code"`
	ErrorMessage string            `json:"error_message,omitempty"`
}

type Comparison struct {
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

type Report struct {
	RunID           string          `json:"run_id"`
	StartedAt       string          `json:"started_at"`
	FinishedAt      string          `json:"finished_at"`
	DurationSeconds float64         `json:"duration_seconds"`
	Environment     Environment     `json:"environment"`
	Before          TestPhaseResult `json:"before"`
	After           TestPhaseResult `json:"after"`
	Comparison      Comparison      `json:"comparison"`
	Success         bool            `json:"success"`
	Error           *string         `json:"error"`
}

// Helpers

func getEnvironment() Environment {
	return Environment{
		GoVersion: runtime.Version(),
		Platform:  runtime.GOOS,
		Arch:      runtime.GOARCH,
		CPUs:      runtime.NumCPU(),
	}
}

func rootDir() string {
	exe, err := os.Executable()
	if err != nil {
		wd, _ := os.Getwd()
		return wd
	}
	return filepath.Dir(filepath.Dir(exe))
}

func testPackages(root string) []string {
	testsDir := filepath.Join(root, "tests")
	entries, err := os.ReadDir(testsDir)
	if err != nil {
		return nil
	}
	var pkgs []string
	for _, e := range entries {
		if e.IsDir() {
			pkgs = append(pkgs, "./tests/"+e.Name()+"/")
		}
	}
	return pkgs
}

func parseSuiteResult(name string, output string, code int, elapsed float64) TestSuiteResult {
	passed := code == 0
	passCount := strings.Count(output, "--- PASS:")
	failCount := strings.Count(output, "--- FAIL:")
	total := passCount + failCount
	return TestSuiteResult{
		Name:       name,
		Passed:     passed,
		Tests:      total,
		Elapsed:    elapsed,
		ReturnCode: code,
		Output:     truncate(output, 2000),
	}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "\n... [truncated]"
}

// Test runners

func runBeforeTests(root string) TestPhaseResult {
	beforeDir := filepath.Join(root, "repository_before")
	entries, _ := os.ReadDir(beforeDir)
	hasCode := false
	for _, e := range entries {
		if e.Name() != ".gitkeep" {
			hasCode = true
			break
		}
	}
	if !hasCode {
		return TestPhaseResult{
			Passed:       true,
			TotalTests:   0,
			PassedTests:  0,
			FailedTests:  0,
			Suites:       nil,
			ReturnCode:   0,
			ErrorMessage: "No implementation in repository_before (expected for new projects)",
		}
	}
	cmd := exec.Command("go", "build", "./repository_before/...")
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	if err != nil {
		return TestPhaseResult{
			Passed:       false,
			ReturnCode:   1,
			ErrorMessage: "repository_before build failed: " + truncate(string(out), 500),
		}
	}
	return TestPhaseResult{Passed: true, ReturnCode: 0}
}

func runAfterTests(root string) TestPhaseResult {
	buildCmd := exec.Command("go", "build", "./repository_after/...")
	buildCmd.Dir = root
	buildOut, buildErr := buildCmd.CombinedOutput()
	if buildErr != nil {
		errMsg := "repository_after build failed: " + truncate(string(buildOut), 500)
		return TestPhaseResult{
			Passed:       false,
			ReturnCode:   1,
			ErrorMessage: errMsg,
		}
	}
	pkgs := testPackages(root)
	if len(pkgs) == 0 {
		return TestPhaseResult{
			Passed:       false,
			ReturnCode:   1,
			ErrorMessage: "No test packages found under tests/",
		}
	}
	var (
		suites      []TestSuiteResult
		totalTests  int
		passedTests int
		failedTests int
		allPassed   = true
		overallCode = 0
	)
	for _, pkg := range pkgs {
		name := strings.TrimPrefix(pkg, "./tests/")
		name = strings.TrimSuffix(name, "/")
		start := time.Now()
		cmd := exec.Command("go", "test", pkg, "-v", "-count=1")
		cmd.Dir = root
		out, err := cmd.CombinedOutput()
		elapsed := time.Since(start).Seconds()
		code := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				code = exitErr.ExitCode()
			} else {
				code = 1
			}
		}
		sr := parseSuiteResult(name, string(out), code, elapsed)
		suites = append(suites, sr)
		totalTests += sr.Tests
		if sr.Passed {
			passedTests += sr.Tests
		} else {
			allPassed = false
			overallCode = 1
			failCount := strings.Count(string(out), "--- FAIL:")
			passInSuite := sr.Tests - failCount
			passedTests += passInSuite
			failedTests += failCount
		}
	}
	return TestPhaseResult{
		Passed:      allPassed,
		TotalTests:  totalTests,
		PassedTests: passedTests,
		FailedTests: failedTests,
		Suites:      suites,
		ReturnCode:  overallCode,
	}
}

// Main evaluation

func main() {
	root := rootDir()
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		wd, _ := os.Getwd()
		root = wd
	}
	reportsDir := filepath.Join(root, "evaluation", "reports")
	os.MkdirAll(reportsDir, 0o755)
	runID := uuid.New().String()
	startTime := time.Now()

	beforeResult := runBeforeTests(root)
	afterResult := runAfterTests(root)

	endTime := time.Now()
	duration := endTime.Sub(startTime).Seconds()

	var summary string
	switch {
	case !beforeResult.Passed && afterResult.Passed:
		summary = "Tests pass after implementation - requirements met."
	case beforeResult.Passed && afterResult.Passed:
		summary = "Tests passed in both states."
	case !afterResult.Passed:
		summary = "Implementation failed to pass requirements."
	default:
		summary = "No tests in repository_before."
	}

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339),
		FinishedAt:      endTime.Format(time.RFC3339),
		DurationSeconds: duration,
		Environment:     getEnvironment(),
		Before:          beforeResult,
		After:           afterResult,
		Comparison: Comparison{
			PassedGate:         afterResult.Passed,
			ImprovementSummary: summary,
		},
		Success: afterResult.Passed,
		Error:   nil,
	}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to marshal report: %v\n", err)
		os.Exit(1)
	}
	reportPath := filepath.Join(reportsDir, "report.json")
	if err := os.WriteFile(reportPath, data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write report: %v\n", err)
		os.Exit(1)
	}

	if !report.Success {
		os.Exit(1)
	}
}
