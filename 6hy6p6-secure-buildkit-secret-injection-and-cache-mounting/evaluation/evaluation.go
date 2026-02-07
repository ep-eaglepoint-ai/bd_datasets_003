package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/google/uuid"
)

type Test struct {
	Name            string   `json:"name"`
	Status          string   `json:"status"`
	Duration        int      `json:"duration"`
	FailureMessages []string `json:"failureMessages"`
}

type Summary struct {
	Total   int `json:"total"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	Xfailed int `json:"xfailed"`
	Errors  int `json:"errors"`
	Skipped int `json:"skipped"`
}

type TestResults struct {
	Success  bool      `json:"success"`
	ExitCode int       `json:"exit_code"`
	Tests    []Test    `json:"tests"`
	Summary  Summary   `json:"summary"`
}

type Comparison struct {
	AfterTestsPassed bool `json:"after_tests_passed"`
	AfterTotal       int  `json:"after_total"`
	AfterPassed      int  `json:"after_passed"`
	AfterFailed      int  `json:"after_failed"`
	AfterXfailed     int  `json:"after_xfailed"`
}

type Environment struct {
	GoVersion    string `json:"go_version"`
	Platform     string `json:"platform"`
	OS           string `json:"os"`
	Architecture string `json:"architecture"`
	Hostname     string `json:"hostname"`
}

type Report struct {
	RunID           string      `json:"run_id"`
	StartedAt       string      `json:"started_at"`
	FinishedAt      string      `json:"finished_at"`
	DurationSeconds float64     `json:"duration_seconds"`
	Success         bool        `json:"success"`
	Error           interface{} `json:"error"`
	Environment     Environment `json:"environment"`
	Results         struct {
		After      TestResults `json:"after"`
		Comparison Comparison  `json:"comparison"`
	} `json:"results"`
}

func runTests() TestResults {
	cmd := exec.Command("go", "test", "./tests")
	cmd.Dir = "/app"
	output, err := cmd.CombinedOutput()
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	status := "passed"
	failureMsg := []string{}
	success := err == nil && exitCode == 0
	if !success {
		status = "failed"
		if len(output) > 0 {
			failureMsg = []string{string(output)}
		}
	}

	tests := []Test{
		{
			Name:            "Go unit tests: ./tests (Dockerfile + repository_after validation)",
			Status:          status,
			Duration:        0,
			FailureMessages: failureMsg,
		},
	}

	passed := 0
	failed := 0
	if status == "passed" {
		passed = 1
	} else {
		failed = 1
	}

	return TestResults{
		Success:  success,
		ExitCode: exitCode,
		Tests:    tests,
		Summary: Summary{
			Total:   1,
			Passed:  passed,
			Failed:  failed,
			Xfailed: 0,
			Errors:  0,
			Skipped: 0,
		},
	}
}

func main() {
	startTime := time.Now().UTC()
	runID := uuid.New().String()

	testResults := runTests()

	endTime := time.Now().UTC()
	duration := endTime.Sub(startTime).Seconds()

	hostname, _ := os.Hostname()

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339),
		FinishedAt:      endTime.Format(time.RFC3339),
		DurationSeconds: duration,
		Success:         testResults.Success,
		Error:           nil,
		Environment: Environment{
			GoVersion:    runtime.Version(),
			Platform:     runtime.GOOS,
			OS:           runtime.GOOS,
			Architecture: runtime.GOARCH,
			Hostname:     hostname,
		},
	}

	report.Results.After = testResults
	report.Results.Comparison = Comparison{
		AfterTestsPassed: testResults.Success,
		AfterTotal:       testResults.Summary.Total,
		AfterPassed:      testResults.Summary.Passed,
		AfterFailed:      testResults.Summary.Failed,
		AfterXfailed:     testResults.Summary.Xfailed,
	}

	timestamp := time.Now().Format("2006-01-02/15-04-05")
	outputDir := filepath.Join("/app/evaluation", timestamp)
	os.MkdirAll(outputDir, 0755)

	outputFile := filepath.Join(outputDir, "report.json")
	data, _ := json.MarshalIndent(report, "", "  ")
	os.WriteFile(outputFile, data, 0644)
	_, _ = os.Stdout.WriteString("Tests completed. Evaluation report written to " + outputFile + "\n")

	if !testResults.Success {
		os.Exit(1)
	}
}
