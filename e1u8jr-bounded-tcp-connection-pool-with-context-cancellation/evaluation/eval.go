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
)

type EnvironmentInfo struct {
	GoVersion     string `json:"go_version"`
	Platform      string `json:"platform"`
	OsType        string `json:"os_type"`
	ExecutionMode string `json:"execution_mode"`
}

type TestResult struct {
	Suite   string `json:"suite"`
	Name    string `json:"name"`
	Outcome string `json:"outcome"`
}

type Summary struct {
	Total   int `json:"total"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	Skipped int `json:"skipped"`
	Errors  int `json:"errors"`
}

type RunResult struct {
	Tests      struct {
		Passed     bool   `json:"passed"`
		ReturnCode int    `json:"return_code"`
		Output     string `json:"output"`
	} `json:"tests"`
	TestCases        []TestResult      `json:"test_cases"`
	CriteriaAnalysis map[string]string `json:"criteria_analysis"`
	Metrics          map[string]any    `json:"metrics"`
}

type Report struct {
	RunID           string          `json:"run_id"`
	StartedAt       string          `json:"started_at"`
	FinishedAt      string          `json:"finished_at"`
	DurationSeconds float64         `json:"duration_seconds"`
	Environment     EnvironmentInfo `json:"environment"`
	Before          RunResult       `json:"before"`
	After           RunResult       `json:"after"`
	Comparison      struct {
		PassedGate         bool   `json:"passed_gate"`
		ImprovementSummary string `json:"improvement_summary"`
	} `json:"comparison"`
	Success bool   `json:"success"`
	Error   *string `json:"error"`
}

func main() {
	start := time.Now()
	startedAt := start.Format(time.RFC3339)

	report := Report{
		RunID:     "run-fixed",
		StartedAt: startedAt,
		Environment: EnvironmentInfo{
			GoVersion:     runtime.Version(),
			Platform:      fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH),
			OsType:        runtime.GOOS,
			ExecutionMode: getExecutionMode(),
		},
	}

	// 1. Run Tests Before (repository_before)
	fmt.Println("Running tests on repository_before...")
	beforeRes := runTests("repository_before")
	report.Before = beforeRes

	// 2. Run Tests After (tests folder)
	fmt.Println("Running tests on repository_after (via tests folder)...")
	afterRes := runTests("tests")
	report.After = afterRes

	end := time.Now()
	report.FinishedAt = end.Format(time.RFC3339)
	report.DurationSeconds = end.Sub(start).Seconds()

	// Logic for pass/fail
	// Before is expected to fail or have no tests
	beforePassed := beforeRes.Tests.Passed
	afterPassed := afterRes.Tests.Passed

	passedGate := afterPassed && !beforePassed
	report.Comparison.PassedGate = passedGate
	report.Success = passedGate

	if passedGate {
		report.Comparison.ImprovementSummary = "Repository after passes all correctness tests while repository before fails as expected."
	} else if afterPassed {
		report.Comparison.ImprovementSummary = "Repository after passes tests, but repository before also passed."
	} else {
		report.Comparison.ImprovementSummary = "Repository after failed tests."
	}

	// Write Report
	outputDir := "evaluation/reports"
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		panic(err)
	}
	outputPath := filepath.Join(outputDir, "report.json")
	file, err := os.Create(outputPath)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		panic(err)
	}

	fmt.Println("\n---------------------------------------------------")
	fmt.Printf("Before Run: ReturnCode=%d, Passed=%v\n", beforeRes.Tests.ReturnCode, beforeRes.Tests.Passed)
	fmt.Printf("After Run:  ReturnCode=%d, Passed=%v\n", afterRes.Tests.ReturnCode, afterRes.Tests.Passed)
	fmt.Println("---------------------------------------------------")
	fmt.Printf("Report saved to: %s\n", outputPath)
}

func getExecutionMode() string {
	if os.Getenv("INSIDE_DOCKER") == "true" {
		return "Inside Docker Container"
	}
	return "Host Machine"
}

// Minimal struct to parse `go test -json` output events
type testEvent struct {
	Action string
	Test   string
	Output string
}

func runTests(targetDir string) RunResult {
	cmd := exec.Command("go", "test", "-v", "-json", fmt.Sprintf("./%s/...", targetDir))
	// We capture combined output to parse JSON, but also want separate stdout/err?
	// `go test` writes json to stdout.
	
	outputBytes, err := cmd.CombinedOutput()
	outputStr := string(outputBytes)
	returnCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			returnCode = exitErr.ExitCode()
		} else {
			returnCode = 1
		}
	}

	testCases, summary := parseGoTestOutput(outputStr)
	
	passed := (returnCode == 0) && (summary.Failed == 0) && (summary.Errors == 0)
    // Careful: if build failed, we might have returnCode != 0 and failed=0, but errors=1?
    // Our parseGoTestOutput handles "Action": "fail" for Package level too usually?
    // If build failed, `go test` returns non-zero.
    
	res := RunResult{
		TestCases: testCases,
		CriteriaAnalysis: mapCriteria(testCases),
		Metrics: map[string]any{
            "summary": summary,
        },
	}
	res.Tests.Passed = passed
	res.Tests.ReturnCode = returnCode
	res.Tests.Output = outputStr
	
	return res
}

func parseGoTestOutput(output string) ([]TestResult, Summary) {
	var results []TestResult
	summary := Summary{}
	
	// Split by line
	// Each line is a JSON object
	// We track status by Test name.
	
	// A map to hold final status of each test
	statusMap := make(map[string]string)
	
	lines := splitLines(output)
	for _, line := range lines {
		if line == "" { continue }
		var ev testEvent
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			// Not json, maybe build output mixed in? ignore
			continue
		}
		
		if ev.Test != "" {
			// It is a specific test case event
			if ev.Action == "pass" {
				statusMap[ev.Test] = "passed"
			} else if ev.Action == "fail" {
				statusMap[ev.Test] = "failed"
			} else if ev.Action == "skip" {
				statusMap[ev.Test] = "skipped"
			}
		}
	}
	
	for name, outcome := range statusMap {
		results = append(results, TestResult{
			Suite:   "main", // simplification
			Name:    name,
			Outcome: outcome,
		})
		summary.Total++
		switch outcome {
		case "passed":
			summary.Passed++
		case "failed":
			summary.Failed++
		case "skipped":
			summary.Skipped++
		}
	}
	
	return results, summary
}

func splitLines(s string) []string {
	var lines []string
	var current []rune
	for _, r := range s {
		if r == '\n' {
			lines = append(lines, string(current))
			current = nil
		} else {
			current = append(current, r)
		}
	}
	if len(current) > 0 {
		lines = append(lines, string(current))
	}
	return lines
}

func mapCriteria(tests []TestResult) map[string]string {
	check := func(fragment string) string {
		found := false
		failed := false
		for _, t := range tests {
			if contains(t.Name, fragment) {
				found = true
				if t.Outcome == "failed" {
					failed = true
				}
			}
		}
		if !found {
			return "Not Run"
		}
		if failed {
			return "Fail"
		}
		return "Pass"
	}

	return map[string]string{
		"MaxConn Enforcement":     check("TestMaxConnBlocking"),
		"Blocking Behavior":       check("TestMaxConnBlocking"),
		"Ghost Grant Handling":    check("TestGhostGrant"),
		"MaxIdleTime Policy":      check("TestMaxIdleTime"),
		"Full Pool on Put":        check("TestPutOverflow"),
		"High Concurrency Stress": check("TestHighConcurrency"),
		"Basic Functionality":     check("TestGetPutBasic"),
	}
}

func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}
