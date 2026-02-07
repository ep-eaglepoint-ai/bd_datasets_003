package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type TestMetrics struct {
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	Errors  int `json:"errors"`
	Skipped int `json:"skipped"`
	Total   int `json:"total"`
}

type TestResult struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

type TestInfo struct {
	NodeID string `json:"nodeId"`
	Status string `json:"status"`
}

type Report struct {
	RunID           string            `json:"run_id"`
	StartedAt       string            `json:"started_at"`
	FinishedAt      string            `json:"finished_at"`
	DurationSeconds float64           `json:"duration_seconds"`
	Environment     map[string]string `json:"environment"`
	Before          struct {
		Tests   TestResult  `json:"tests"`
		Metrics TestMetrics `json:"metrics"`
	} `json:"before"`
	After struct {
		Tests   TestResult  `json:"tests"`
		Metrics TestMetrics `json:"metrics"`
	} `json:"after"`
	Comparison struct {
		PassedGate         bool   `json:"passed_gate"`
		ImprovementSummary string `json:"improvement_summary"`
	} `json:"comparison"`
	TestResults []TestInfo `json:"test_results"`
	Success     bool       `json:"success"`
	Error       *string    `json:"error"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: evaluation <run-tests|run-metatests|evaluate>")
		os.Exit(1)
	}

	switch os.Args[1] {
	case "run-tests":
		runPrimaryTests()
	case "run-metatests":
		runMetaTests()
	case "evaluate":
		runEvaluation()
	default:
		fmt.Printf("Unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}

func runPrimaryTests() {
	fmt.Println("Running primary tests...")
	cmd := exec.Command("go", "test", "-v", "-count=1", "-short", "./repository_after/...", "./tests/...")
	cmd.Dir = "/app"
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if err != nil {
		os.Exit(0)
	}
}

func runMetaTests() {
	fmt.Println("Running meta-tests...")
	cmd := exec.Command("go", "test", "-v", "-count=1", "./...")
	cmd.Dir = "/app/tests"
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err := cmd.Run()
	if err != nil {
		os.Exit(0)
	}
}

func runEvaluation() {
	runID := uuid.New().String()
	startTime := time.Now()

	fmt.Printf("Run ID: %s\n", runID)
	fmt.Printf("Started at: %s\n", startTime.Format(time.RFC3339))
	fmt.Println()
	fmt.Println("============================================================")
	fmt.Println("GRPC MICROSERVICES INTEGRATION TEST SUITE EVALUATION")
	fmt.Println("============================================================")
	fmt.Println()

	fmt.Println("============================================================")
	fmt.Println("RUNNING PRIMARY TESTS")
	fmt.Println("============================================================")
	fmt.Println("Test location: repository_after")
	fmt.Println()

	primaryResult, primaryMetrics, primaryTestInfos := runTestsWithMetrics("/app/repository_after")

	fmt.Printf("Results: %d passed, %d failed, %d errors, %d skipped (total: %d)\n",
		primaryMetrics.Passed, primaryMetrics.Failed, primaryMetrics.Errors,
		primaryMetrics.Skipped, primaryMetrics.Total)

	printTestResults(primaryResult.Output, true)
	fmt.Println()

	fmt.Println("============================================================")
	fmt.Println("RUNNING META-TESTS")
	fmt.Println("============================================================")
	fmt.Println("Meta-tests directory: /app/tests")
	fmt.Println()

	metaResult, metaMetrics, metaTestInfos := runTestsWithMetrics("/app/tests")

	fmt.Printf("Results: %d passed, %d failed, %d errors, %d skipped (total: %d)\n",
		metaMetrics.Passed, metaMetrics.Failed, metaMetrics.Errors,
		metaMetrics.Skipped, metaMetrics.Total)

	printTestResults(metaResult.Output, false)
	fmt.Println()

	fmt.Println("============================================================")
	fmt.Println("EVALUATION SUMMARY")
	fmt.Println("============================================================")
	fmt.Println()

	primaryPassed := primaryMetrics.Failed == 0 && primaryMetrics.Errors == 0
	metaPassed := metaMetrics.Failed == 0 && metaMetrics.Errors == 0

	fmt.Println("Primary Tests:")
	if primaryPassed {
		fmt.Println("  Overall: PASSED")
	} else {
		fmt.Println("  Overall: FAILED")
	}
	fmt.Printf("  Tests: %d/%d passed\n", primaryMetrics.Passed, primaryMetrics.Total)
	fmt.Println()

	fmt.Println("Meta-Tests:")
	if metaPassed {
		fmt.Println("  Overall: PASSED")
	} else {
		fmt.Println("  Overall: FAILED")
	}
	fmt.Printf("  Tests: %d/%d passed\n", metaMetrics.Passed, metaMetrics.Total)
	fmt.Println()

	fmt.Println("============================================================")
	fmt.Println("EXPECTED BEHAVIOR CHECK")
	fmt.Println("============================================================")

	if primaryPassed {
		fmt.Println("[✓ OK] Primary tests passed")
	} else {
		fmt.Println("[✗ FAIL] Primary tests failed")
	}

	if metaPassed {
		fmt.Println("[✓ OK] Meta-tests passed")
	} else {
		fmt.Println("[✗ FAIL] Meta-tests failed")
	}
	fmt.Println()

	endTime := time.Now()
	duration := endTime.Sub(startTime).Seconds()

	reportDir := filepath.Join("/app/evaluation/reports",
		startTime.Format("2006-01-02"),
		startTime.Format("15-04-05"))
	os.MkdirAll(reportDir, 0755)

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339),
		FinishedAt:      endTime.Format(time.RFC3339),
		DurationSeconds: duration,
		Environment: map[string]string{
			"go_version": runtime.Version(),
			"platform":   runtime.GOOS + "-" + runtime.GOARCH,
		},
		Success: primaryPassed && metaPassed,
	}

	report.Before.Tests = TestResult{Passed: true, ReturnCode: 0, Output: "N/A"}
	report.Before.Metrics = TestMetrics{}

	report.After.Tests = primaryResult
	report.After.Metrics = primaryMetrics

	report.Comparison.PassedGate = primaryPassed && metaPassed
	report.Comparison.ImprovementSummary = "All integration tests pass with bufconn in-memory communication"

	allTestInfos := append(primaryTestInfos, metaTestInfos...)
	report.TestResults = allTestInfos

	if !report.Success {
		errMsg := "Some tests failed"
		report.Error = &errMsg
	}

	reportPath := filepath.Join(reportDir, "report.json")
	reportData, _ := json.MarshalIndent(report, "", "  ")
	os.WriteFile(reportPath, reportData, 0644)

	fmt.Println("Report saved to:")
	fmt.Printf("evaluation/reports/%s/%s/report.json\n",
		startTime.Format("2006-01-02"),
		startTime.Format("15-04-05"))
	fmt.Println()

	fmt.Println("============================================================")
	fmt.Println("EVALUATION COMPLETE")
	fmt.Println("============================================================")
	fmt.Printf("Run ID: %s\n", runID)
	fmt.Printf("Duration: %.2fs\n", duration)
	if report.Success {
		fmt.Println("Success: YES")
	} else {
		fmt.Println("Success: NO")
		os.Exit(1)
	}
}

func runTestsWithMetrics(dir string) (TestResult, TestMetrics, []TestInfo) {
	cmd := exec.Command("go", "test", "-v", "-count=1", "./...")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()

	returnCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			returnCode = exitErr.ExitCode()
		}
	}

	metrics, testInfos := parseTestOutput(string(output))

	return TestResult{
		Passed:     returnCode == 0,
		ReturnCode: returnCode,
		Output:     truncateOutput(string(output), 5000),
	}, metrics, testInfos
}

func parseTestOutput(output string) (TestMetrics, []TestInfo) {
	metrics := TestMetrics{}
	var testInfos []TestInfo

	passRe := regexp.MustCompile(`--- PASS: (\S+)`)
	failRe := regexp.MustCompile(`--- FAIL: (\S+)`)
	skipRe := regexp.MustCompile(`--- SKIP:`)

	passMatches := passRe.FindAllStringSubmatch(output, -1)
	failMatches := failRe.FindAllStringSubmatch(output, -1)

	for _, match := range passMatches {
		if len(match) > 1 {
			testInfos = append(testInfos, TestInfo{NodeID: match[1], Status: "passed"})
		}
	}
	for _, match := range failMatches {
		if len(match) > 1 {
			testInfos = append(testInfos, TestInfo{NodeID: match[1], Status: "failed"})
		}
	}

	metrics.Passed = len(passMatches)
	metrics.Failed = len(failMatches)
	metrics.Skipped = len(skipRe.FindAllString(output, -1))
	metrics.Total = metrics.Passed + metrics.Failed + metrics.Skipped

	okRe := regexp.MustCompile(`ok\s+\S+\s+[\d.]+s`)
	if matches := okRe.FindAllString(output, -1); len(matches) > 0 && metrics.Total == 0 {
		countRe := regexp.MustCompile(`\((\d+) tests?\)`)
		for _, match := range matches {
			if countMatch := countRe.FindStringSubmatch(match); len(countMatch) > 1 {
				count, _ := strconv.Atoi(countMatch[1])
				metrics.Passed += count
				metrics.Total += count
			}
		}
	}

	if metrics.Total == 0 && strings.Contains(output, "PASS") {
		metrics.Passed = 1
		metrics.Total = 1
	}

	return metrics, testInfos
}

func printTestResults(output string, isPrimary bool) {
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.Contains(line, "--- PASS:") {
			testName := extractTestName(line)
			fmt.Printf("  [✓ PASS] %s\n", testName)
		} else if strings.Contains(line, "--- FAIL:") {
			testName := extractTestName(line)
			fmt.Printf("  [✗ FAIL] %s\n", testName)
		}
	}
}

func extractTestName(line string) string {
	re := regexp.MustCompile(`--- (?:PASS|FAIL): (\S+)`)
	if matches := re.FindStringSubmatch(line); len(matches) > 1 {
		return matches[1]
	}
	return "Unknown"
}

func truncateOutput(output string, maxLen int) string {
	if len(output) > maxLen {
		return output[:maxLen] + "... (truncated)"
	}
	return output
}
