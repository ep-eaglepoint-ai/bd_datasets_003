package main

import (
	"bufio"
	"encoding/json"
	"io"
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

type goTestEvent struct {
	Time    time.Time `json:"Time"`
	Action  string    `json:"Action"`
	Package string    `json:"Package"`
	Test    string    `json:"Test"`
	Elapsed float64   `json:"Elapsed"`
	Output  string    `json:"Output"`
}

func runTests() TestResults {
	cmd := exec.Command("go", "test", "-json", "./tests")
	cmd.Dir = "/app"

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return TestResults{Success: false, ExitCode: 1}
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return TestResults{Success: false, ExitCode: 1}
	}

	if err := cmd.Start(); err != nil {
		return TestResults{Success: false, ExitCode: 1}
	}

	testMap := map[string]*Test{}
	outputMap := map[string][]string{}
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Bytes()
		var ev goTestEvent
		if err := json.Unmarshal(line, &ev); err != nil {
			continue
		}
		if ev.Test == "" {
			continue
		}
		key := ev.Package + "/" + ev.Test
		t, ok := testMap[key]
		if !ok {
			t = &Test{Name: ev.Test, Status: "running", Duration: 0, FailureMessages: []string{}}
			testMap[key] = t
		}
		switch ev.Action {
		case "pass":
			t.Status = "passed"
			t.Duration = int(ev.Elapsed)
		case "fail":
			t.Status = "failed"
			t.Duration = int(ev.Elapsed)
			if out := outputMap[key]; len(out) > 0 {
				t.FailureMessages = append(t.FailureMessages, out...)
			}
		case "skip":
			t.Status = "skipped"
			t.Duration = int(ev.Elapsed)
		case "output":
			if ev.Output != "" {
				outputMap[key] = append(outputMap[key], ev.Output)
			}
		}
	}

	_ = scanner.Err()
	_, _ = io.Copy(io.Discard, stderr)
	err = cmd.Wait()
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	tests := make([]Test, 0, len(testMap))
	for _, t := range testMap {
		tests = append(tests, *t)
	}

	passed := 0
	failed := 0
	skipped := 0
	errors := 0

	for _, t := range tests {
		switch t.Status {
		case "passed":
			passed++
		case "failed":
			failed++
		case "skipped":
			skipped++
		default:
			errors++
		}
	}

	success := err == nil && exitCode == 0 && failed == 0 && errors == 0

	return TestResults{
		Success:  success,
		ExitCode: exitCode,
		Tests:    tests,
		Summary: Summary{
			Total:   len(tests),
			Passed:  passed,
			Failed:  failed,
			Xfailed: 0,
			Errors:  errors,
			Skipped: skipped,
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
