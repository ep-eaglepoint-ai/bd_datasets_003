package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type TestEvent struct {
	Action  string `json:"Action"`
	Test    string `json:"Test"`
	Package string `json:"Package"`
}

type TestCase struct {
	Suite   string `json:"suite"`
	Name    string `json:"name"`
	Outcome string `json:"outcome"`
}

type TestSummary struct {
	Total  int `json:"total"`
	Passed int `json:"passed"`
	Failed int `json:"failed"`
	Errors int `json:"errors"`
}

type TestRun struct {
	Success    bool        `json:"success"`
	ExitCode   int         `json:"exit_code"`
	Tests      []TestCase  `json:"tests"`
	Summary    TestSummary `json:"summary"`
	Stdout     string      `json:"stdout"`
	Stderr     string      `json:"stderr"`
	DurationMs int64       `json:"duration_ms"`
}

type TestStatus struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

type TestResult struct {
	Tests     TestStatus             `json:"tests"`
	TestCases []TestCase             `json:"test_cases,omitempty"`
	Metrics   map[string]interface{} `json:"metrics,omitempty"`
}

type Comparison struct {
	PassedGate         bool              `json:"passed_gate"`
	ImprovementSummary string            `json:"improvement_summary"`
	CriteriaAnalysis   map[string]string `json:"criteria_analysis,omitempty"`
}

type Report struct {
	RunID           string            `json:"run_id"`
	StartedAt       string            `json:"started_at"`
	FinishedAt      string            `json:"finished_at"`
	DurationSeconds float64           `json:"duration_seconds"`
	Environment     map[string]string `json:"environment"`
	Before          *TestResult       `json:"before"`
	After           *TestResult       `json:"after"`
	Comparison      Comparison        `json:"comparison"`
	Success         bool              `json:"success"`
	Error           *string           `json:"error"`
}

func generateRunID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func getEnvironmentInfo() map[string]string {
	return map[string]string{
		"go_version":     runtime.Version(),
		"platform":       runtime.GOOS,
		"os_type":        runtime.GOARCH,
		"execution_mode": envOr("INSIDE_DOCKER", "false"),
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func generateOutputPath(projectRoot, customPath string) (string, error) {
	if customPath != "" {
		return filepath.Abs(customPath)
	}

	now := time.Now()
	dateStr := now.Format("2006-01-02")
	timeStr := now.Format("15-04-05")

	evalDir := projectRoot
	outputDir := filepath.Join(evalDir, "reports", dateStr, timeStr)

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(outputDir, "report.json"), nil
}

func runGoTestJSON(dir string, args ...string) (TestRun, error) {
	start := time.Now()
	cmdArgs := append([]string{"test", "-json", "-count=1"}, args...)
	cmd := exec.Command("go", cmdArgs...)
	cmd.Dir = dir

	stdoutPipe, _ := cmd.StdoutPipe()
	stderrPipe, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return TestRun{}, err
	}

	var stdoutBuf, stderrBuf strings.Builder
	events := []TestCase{}

	// Parse stdout JSON stream.
	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			line := scanner.Text()
			stdoutBuf.WriteString(line + "\n")
			var ev TestEvent
			if json.Unmarshal([]byte(line), &ev) == nil {
				if ev.Test != "" && (ev.Action == "pass" || ev.Action == "fail") {
					events = append(events, TestCase{
						Suite:   ev.Package,
						Name:    ev.Test,
						Outcome: mapOutcome(ev.Action),
					})
				}
			}
		}
	}()

	// Collect stderr.
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			stderrBuf.WriteString(scanner.Text() + "\n")
		}
	}()

	err := cmd.Wait()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	summary := TestSummary{
		Total:  len(events),
		Passed: countOutcome(events, "passed"),
		Failed: countOutcome(events, "failed"),
		Errors: func() int { if exitCode != 0 && len(events) == 0 { return 1 }; return 0 }(),
	}

	return TestRun{
		Success:    exitCode == 0 || (summary.Passed > 0 && summary.Failed == 0),
		ExitCode:   exitCode,
		Tests:      events,
		Summary:    summary,
		Stdout:     stdoutBuf.String(),
		Stderr:     stderrBuf.String(),
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

func mapOutcome(action string) string {
	if action == "pass" {
		return "passed"
	}
	return "failed"
}

func countOutcome(tests []TestCase, outcome string) int {
	count := 0
	for _, t := range tests {
		if t.Outcome == outcome {
			count++
		}
	}
	return count
}

func mapCriteria(tests []TestCase) map[string]string {
	check := func(fragments ...string) string {
		matching := []TestCase{}
		for _, t := range tests {
			for _, frag := range fragments {
				if strings.Contains(strings.ToLower(t.Name), strings.ToLower(frag)) {
					matching = append(matching, t)
					break
				}
			}
		}
		if len(matching) == 0 {
			return "Not Run"
		}
		for _, t := range matching {
			if t.Outcome == "failed" {
				return "Fail"
			}
		}
		return "Pass"
	}

	return map[string]string{
		"concurrency_no_oversell": check("ConcurrentSameProduct"),
		"duplicate_ids":           check("DuplicateOrderID"),
		"insufficient_stock":      check("InsufficientStock"),
		"high_amount_decline":     check("HighAmountPaymentDeclined"),
		"non_positive_qty":        check("NonPositiveQuantities"),
		"status_shipped":          check("HappyPath_SetsShipped"),
		"rollback_semantics":      check("InventoryUnchanged"),
	}
}

func main() {
	start := time.Now()
	runID := generateRunID()
	wd, _ := os.Getwd()
	projectRoot := wd
	repoAfter := filepath.Clean(filepath.Join(projectRoot, "..", "repository_after"))

	fmt.Printf("Starting Order Fulfillment Evaluation [Run ID: %s]\n", runID)

	afterRun, err := runGoTestJSON(repoAfter, "./...")
	if err != nil {
		fmt.Printf("Error running tests: %v\n", err)
	}
	if afterRun.Summary.Total == 0 {
		fmt.Println("No tests were detected. Raw stdout/stderr:")
		if afterRun.Stdout != "" {
			fmt.Println("--- stdout ---")
			fmt.Print(afterRun.Stdout)
		}
		if afterRun.Stderr != "" {
			fmt.Println("--- stderr ---")
			fmt.Print(afterRun.Stderr)
		}
	}

	// Prepare output string (combining stdout and stderr)
	outputCombined := afterRun.Stdout
	if afterRun.Stderr != "" {
		outputCombined += "\n" + afterRun.Stderr
	}

	afterResult := &TestResult{
		Tests: TestStatus{
			Passed:     afterRun.Success,
			ReturnCode: afterRun.ExitCode,
			Output:     outputCombined,
		},
		TestCases: afterRun.Tests,
		Metrics:   map[string]interface{}{},
	}

	passedGate := afterRun.Success
	var improvementSummary string
	if passedGate {
		improvementSummary = "Tests passed successfully"
	} else {
		improvementSummary = "Tests failed"
	}

	report := Report{
		RunID:           runID,
		StartedAt:       start.Format(time.RFC3339),
		FinishedAt:      time.Now().Format(time.RFC3339),
		DurationSeconds: time.Since(start).Seconds(),
		Environment:     getEnvironmentInfo(),
		Before:          nil,
		After:           afterResult,
		Comparison: Comparison{
			PassedGate:         passedGate,
			ImprovementSummary: improvementSummary,
			CriteriaAnalysis:   mapCriteria(afterRun.Tests),
		},
		Success: passedGate,
		Error:   nil,
	}

	outputPath, err := generateOutputPath(projectRoot, "")
	if err != nil {
		fmt.Printf("Error generating output path: %v\n", err)
		return
	}

	data, _ := json.MarshalIndent(report, "", "  ")
	_ = os.WriteFile(outputPath, data, 0o644)

	fmt.Println("---------------------------------------------------")
	fmt.Printf("Tests Run: %d\n", afterRun.Summary.Total)
	fmt.Printf("Passed:    %d\n", afterRun.Summary.Passed)
	fmt.Printf("Failed:    %d\n", afterRun.Summary.Failed)
	fmt.Println("---------------------------------------------------")
	fmt.Printf("✅ Report saved to: %s\n", outputPath)
}
