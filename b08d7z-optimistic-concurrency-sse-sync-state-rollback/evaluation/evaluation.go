package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

type TestCase struct {
	NodeID  string `json:"nodeid"`
	Name    string `json:"name"`
	Outcome string `json:"outcome"`
}

type Summary struct {
	Total   int `json:"total"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	Errors  int `json:"errors"`
	Skipped int `json:"skipped"`
}

type TestResults struct {
	Success  bool       `json:"success"`
	ExitCode int        `json:"exit_code"`
	Tests    []TestCase `json:"tests"`
	Summary  Summary    `json:"summary"`
	Stdout   string     `json:"stdout"`
	Stderr   string     `json:"stderr"`
}

type Environment struct {
	GoVersion    string `json:"go_version"`
	Platform     string `json:"platform"`
	OS           string `json:"os"`
	OSRelease    string `json:"os_release"`
	Architecture string `json:"architecture"`
	Hostname     string `json:"hostname"`
	GitCommit    string `json:"git_commit"`
	GitBranch    string `json:"git_branch"`
}

type Comparison struct {
	BeforeTestsPassed bool `json:"before_tests_passed"`
	AfterTestsPassed  bool `json:"after_tests_passed"`
	BeforeTotal       int  `json:"before_total"`
	BeforePassed      int  `json:"before_passed"`
	BeforeFailed      int  `json:"before_failed"`
	AfterTotal        int  `json:"after_total"`
	AfterPassed       int  `json:"after_passed"`
	AfterFailed       int  `json:"after_failed"`
}

type Results struct {
	Before     *TestResults `json:"before"`
	After      *TestResults `json:"after"`
	Comparison Comparison   `json:"comparison"`
}

type RequirementStatus struct {
	ID          string   `json:"id"`
	Description string   `json:"description"`
	Status      string   `json:"status"`
	Checks      []string `json:"checks"`
}

type ReportSummary struct {
	TotalRequirements     int `json:"total_requirements"`
	SatisfiedRequirements int `json:"satisfied_requirements"`
	FailedRequirements    int `json:"failed_requirements"`
	TotalChecks           int `json:"total_checks"`
	PassedChecks          int `json:"passed_checks"`
	FailedChecks          int `json:"failed_checks"`
}

type Report struct {
	RunID           string      `json:"run_id"`
	StartedAt       string      `json:"started_at"`
	FinishedAt      string      `json:"finished_at"`
	DurationSeconds float64     `json:"duration_seconds"`
	Success         bool        `json:"success"`
	Error           *string     `json:"error"`
	Environment     Environment `json:"environment"`
	Results         Results     `json:"results"`
}

type goTestEvent struct {
	Time    string `json:"Time"`
	Action  string `json:"Action"`
	Package string `json:"Package"`
	Test    string `json:"Test"`
	Output  string `json:"Output"`
}

func getGitInfo() (string, string) {
	commit := "unknown"
	branch := "unknown"

	if out, err := exec.Command("git", "rev-parse", "--short", "HEAD").Output(); err == nil {
		commit = strings.TrimSpace(string(out))
	}
	if out, err := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD").Output(); err == nil {
		branch = strings.TrimSpace(string(out))
	}
	return commit, branch
}

func getOSRelease() string {
	if runtime.GOOS == "windows" {
		return "unknown"
	}
	out, err := exec.Command("uname", "-r").Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}

func getEnvironmentInfo() Environment {
	commit, branch := getGitInfo()
	osRelease := getOSRelease()
	platform := fmt.Sprintf("%s-%s-%s", runtime.GOOS, osRelease, runtime.GOARCH)

	hostname, _ := os.Hostname()

	return Environment{
		GoVersion:    runtime.Version(),
		Platform:     platform,
		OS:           runtime.GOOS,
		OSRelease:    osRelease,
		Architecture: runtime.GOARCH,
		Hostname:     hostname,
		GitCommit:    commit,
		GitBranch:    branch,
	}
}

func getRootDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		return "/app"
	}
	base := filepath.Base(cwd)
	if base == "evaluation" || base == "tests" {
		return filepath.Dir(cwd)
	}
	if cwd == "." {
		return "/app"
	}
	return cwd
}

func runTests(repoPath string, rootDir string) (TestResults, map[string][]string) {
	testsDir := filepath.Join(rootDir, "tests")

	// Run the test wrapper directly to avoid directory path issues
	cmd := exec.Command("go", "run", "test_wrapper.go")
	cmd.Dir = testsDir
	cmd.Env = append(os.Environ(), fmt.Sprintf("REPO_PATH=%s", repoPath))

	output, err := cmd.CombinedOutput()
	outputStr := string(output)

	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = 2
		}
	}

	// Parse the unified test output
	statusMap := make(map[string]string)
	packageMap := make(map[string]string)
	outputMap := make(map[string][]string)
	order := make([]string, 0, 64)

	lines := strings.Split(outputStr, "\n")
	for _, line := range lines {
		// Parse backend test results from Go test output
		if strings.Contains(line, "--- PASS:") {
			testName := strings.TrimSpace(strings.Split(line, "--- PASS:")[1])
			testName = strings.Split(testName, " ")[0]
			if _, ok := statusMap[testName]; !ok {
				order = append(order, testName)
			}
			statusMap[testName] = "passed"
			packageMap[testName] = "backend-tests"
		} else if strings.Contains(line, "--- FAIL:") {
			testName := strings.TrimSpace(strings.Split(line, "--- FAIL:")[1])
			testName = strings.Split(testName, " ")[0]
			if _, ok := statusMap[testName]; !ok {
				order = append(order, testName)
			}
			statusMap[testName] = "failed"
			packageMap[testName] = "backend-tests"
		}

		// Parse frontend test results from Jest output
		if strings.Contains(line, "✓") {
			// Look for specific test patterns in Jest output
			if strings.Contains(line, "TestMustNotUseExternalLibraries") {
				testName := "TestFrontendREQ1"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			} else if strings.Contains(line, "TestMustUseUseRefOrUseStateToTrackPreviousStateForRollbackPurposes") {
				testName := "TestFrontendREQ5"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			} else if strings.Contains(line, "TestStateDecrementMustHappenBeforeFetchPromiseResolvesOptimistic") {
				testName := "TestFrontendREQ6"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			} else if strings.Contains(line, "TestIfFetchFailsCatchBlockOrNon200StatusStateMustRevertToPreviousValue") {
				testName := "TestFrontendREQ7"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			} else if strings.Contains(line, "TestMustUseUseEffectToManageEventSourceConnectionAndCloseItOnUnmount") {
				testName := "TestFrontendREQ8"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			} else if strings.Contains(line, "TestRollbackTestFrontendMockFetchToReturn500ErrorCallBookSeatVerifyStateDecrementsImmediatelyVisualFeedbackWaitsForDelayThenRevertsToOriginalValueAutomatically") {
				testName := "TestFrontendREQ10"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			} else if strings.Contains(line, "TestResyncTestFullStackConnectClientAAndClientBClientABooksSeatVerifyClientBReceivesSSEUpdateAndUpdatesDisplayedCountWithoutAnyInteraction") {
				testName := "TestFrontendREQ11"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			} else if strings.Contains(line, "TestSuccessfulBookingFlow") {
				testName := "TestFrontendSuccessfulBookingFlow"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			} else if strings.Contains(line, "TestConnectionStatusManagement") {
				testName := "TestFrontendConnectionStatusManagement"
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
					statusMap[testName] = "passed"
					packageMap[testName] = "frontend-tests"
				}
			}
		}

		// Also parse from test wrapper output format
		if strings.Contains(line, "backend::") {
			if strings.Contains(line, "PASSED") {
				testName := strings.Split(line, "backend::")[1]
				testName = strings.TrimSpace(testName)
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
				}
				statusMap[testName] = "passed"
				packageMap[testName] = "backend-tests"
			} else if strings.Contains(line, "FAILED") {
				testName := strings.Split(line, "backend::")[1]
				testName = strings.TrimSpace(testName)
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
				}
				statusMap[testName] = "failed"
				packageMap[testName] = "backend-tests"
			}
		} else if strings.Contains(line, "frontend::") {
			if strings.Contains(line, "PASSED") {
				testName := strings.Split(line, "frontend::")[1]
				testName = strings.TrimSpace(testName)
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
				}
				statusMap[testName] = "passed"
				packageMap[testName] = "frontend-tests"
			} else if strings.Contains(line, "FAILED") {
				testName := strings.Split(line, "frontend::")[1]
				testName = strings.TrimSpace(testName)
				if _, ok := statusMap[testName]; !ok {
					order = append(order, testName)
				}
				statusMap[testName] = "failed"
				packageMap[testName] = "frontend-tests"
			}
		}
	}

	sort.Strings(order)
	results := make([]TestCase, 0, len(order))
	summary := Summary{}

	for _, testName := range order {
		outcome := statusMap[testName]
		nodeID := fmt.Sprintf("%s::%s", packageMap[testName], testName)
		results = append(results, TestCase{
			NodeID:  nodeID,
			Name:    testName,
			Outcome: outcome,
		})

		switch outcome {
		case "passed":
			summary.Passed++
		case "failed":
			summary.Failed++
		case "skipped":
			summary.Skipped++
		}
	}

	if exitCode != 0 && summary.Failed == 0 {
		summary.Errors = 1
	}

	summary.Total = summary.Passed + summary.Failed + summary.Errors + summary.Skipped

	logicalSuccess := exitCode == 0 && summary.Failed == 0 && summary.Errors == 0
	logicalExitCode := exitCode
	if !logicalSuccess && exitCode == 0 {
		logicalExitCode = 1
	}

	return TestResults{
		Success:  logicalSuccess,
		ExitCode: logicalExitCode,
		Tests:    results,
		Summary:  summary,
		Stdout:   outputStr,
		Stderr:   "",
	}, outputMap
}

func errorResult(message string) (TestResults, map[string][]string) {
	return TestResults{
		Success:  false,
		ExitCode: 2,
		Tests:    []TestCase{},
		Summary:  Summary{Total: 0, Passed: 0, Failed: 0, Errors: 1, Skipped: 0},
		Stdout:   "",
		Stderr:   message,
	}, make(map[string][]string)
}

func generateRunID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func mapRequirements(afterResults TestResults) ([]RequirementStatus, ReportSummary) {
	reqs := []struct {
		id   string
		desc string
		test []string // Support multiple test names
	}{
		{"REQ-01", "Must NOT use external libraries", []string{"TestMustNotUseExternalLibraries", "TestFrontendREQ1"}},
		{"REQ-02", "Must use sync.Mutex to protect decrement operation", []string{"TestMustUseSyncMutexToProtectDecrementOperation"}},
		{"REQ-03", "Must implement Server-Sent Events with correct headers", []string{"TestMustImplementServerSentEventsWithCorrectHeaders"}},
		{"REQ-04", "Must broadcast updates to all active clients", []string{"TestMustBroadcastUpdatesToAllActiveClientsAfterSuccessfulBooking"}},
		{"REQ-05", "Must use useRef or useState for rollback tracking", []string{"TestFrontendREQ5"}},
		{"REQ-06", "State decrement must happen before fetch resolves (Optimistic)", []string{"TestFrontendREQ6"}},
		{"REQ-07", "State must revert on fetch failure", []string{"TestFrontendREQ7"}},
		{"REQ-08", "Must use useEffect to manage EventSource connection", []string{"TestFrontendREQ8"}},
		{"REQ-09", "Concurrency Test: 1 seat, 5 requests → 1 success, 4 conflicts", []string{"TestConcurrencyTestBackendInitializeServerWith1SeatLaunch5ConcurrentPOSTBookRequestsVerifyExactlyOneReturns200OKAndFourReturn409Conflict"}},
		{"REQ-10", "Rollback Test: Mock 500 error, verify optimistic then rollback", []string{"TestFrontendREQ10"}},
		{"REQ-11", "Resync Test: Client A books, Client B receives SSE update", []string{"TestFrontendREQ11"}},
	}

	testOutcomes := make(map[string]string)
	for _, t := range afterResults.Tests {
		testOutcomes[t.Name] = t.Outcome
	}

	result := make([]RequirementStatus, 0)
	satisfied := 0

	for _, r := range reqs {
		status := "FAIL"
		checks := []string{}
		
		// Check all possible test names for this requirement
		for _, testName := range r.test {
			checks = append(checks, testName)
			if testOutcomes[testName] == "passed" {
				status = "PASS"
			}
		}
		
		if status == "PASS" {
			satisfied++
		}
		
		result = append(result, RequirementStatus{
			ID:          r.id,
			Description: r.desc,
			Status:      status,
			Checks:      checks,
		})
	}

	summary := ReportSummary{
		TotalRequirements:     len(reqs),
		SatisfiedRequirements: satisfied,
		FailedRequirements:    len(reqs) - satisfied,
		TotalChecks:           afterResults.Summary.Total,
		PassedChecks:          afterResults.Summary.Passed,
		FailedChecks:          afterResults.Summary.Failed + afterResults.Summary.Errors,
	}

	return result, summary
}

func printPytestLikeReport(results TestResults, repoLabel string, duration float64, outputMap map[string][]string) string {
	var b strings.Builder
	f := func(format string, a ...interface{}) {
		fmt.Printf(format, a...)
		fmt.Fprintf(&b, format, a...)
	}

	f("\n============================= test session starts (%s) ==============================\n", repoLabel)
	f("platform %s -- Go %s\n", runtime.GOOS, runtime.Version())
	f("collected %d items\n\n", results.Summary.Total)

	testFile := "/app/tests"
	f("%s ", testFile)
	for _, t := range results.Tests {
		if t.Outcome == "passed" {
			f(".")
		} else if t.Outcome == "failed" {
			f("F")
		} else if t.Outcome == "skipped" {
			f("s")
		} else {
			f("E")
		}
	}
	f(" [100%%]\n\n")

	if results.Summary.Failed > 0 || results.Summary.Errors > 0 {
		f("=================================== FAILURES ===================================\n")
		for _, t := range results.Tests {
			if t.Outcome == "failed" || t.Outcome == "error" {
				f("_________________________________ %s __________________________________\n", t.Name)
				if outputs, ok := outputMap[t.Name]; ok {
					for _, line := range outputs {
						f("%s", line)
					}
				}
				f("\n")
			}
		}
	}

	f("=========================== short test summary info ============================\n")
	for _, t := range results.Tests {
		if t.Outcome == "failed" {
			f("FAILED %s::%s\n", testFile, t.Name)
		} else if t.Outcome == "error" {
			f("ERROR %s::%s\n", testFile, t.Name)
		}
	}

	summaryParts := []string{}
	if results.Summary.Failed > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d failed", results.Summary.Failed))
	}
	if results.Summary.Passed > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d passed", results.Summary.Passed))
	}
	if results.Summary.Skipped > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d skipped", results.Summary.Skipped))
	}
	if results.Summary.Errors > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d errors", results.Summary.Errors))
	}

	f("========================= %s in %.2fs =========================\n",
		strings.Join(summaryParts, ", "), duration)

	return b.String()
}

func main() {
	startTime := time.Now()
	runID := generateRunID()
	rootDir := getRootDir()
	afterPath := filepath.Join(rootDir, "repository_after")

	fmt.Printf("Starting Evaluation Run: %s\n", runID)

	afterResults, afterOutputMap := runTests(afterPath, rootDir)

	finishTime := time.Now()
	duration := finishTime.Sub(startTime).Seconds()

	_, reportSummary := mapRequirements(afterResults)

	verdictSuccess := afterResults.Success && reportSummary.FailedRequirements == 0
	var errMsg *string
	if !verdictSuccess {
		msg := "One or more requirements failed"
		if !afterResults.Success && afterResults.Summary.Errors > 0 {
			msg = "Evaluation error: " + afterResults.Stderr
		}
		errMsg = &msg
	}

	afterResults.Stdout = printPytestLikeReport(afterResults, "repository_after", duration, afterOutputMap)

	beforeReport := &TestResults{
		Success:  false,
		ExitCode: 1,
		Tests:    []TestCase{},
		Summary:  Summary{Total: 0, Passed: 0, Failed: 0, Errors: 0, Skipped: 0},
		Stdout:   "",
		Stderr:   "",
	}

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339Nano),
		FinishedAt:      finishTime.Format(time.RFC3339Nano),
		DurationSeconds: duration,
		Success:         verdictSuccess,
		Error:           errMsg,
		Environment:     getEnvironmentInfo(),
		Results: Results{
			Before: beforeReport,
			After:  &afterResults,
			Comparison: Comparison{
				BeforeTestsPassed: false,
				BeforeTotal:       0,
				BeforePassed:      0,
				BeforeFailed:      0,
				AfterTestsPassed:  afterResults.Success,
				AfterTotal:        afterResults.Summary.Total,
				AfterPassed:       afterResults.Summary.Passed,
				AfterFailed:       afterResults.Summary.Failed,
			},
		},
	}

	outputDir := filepath.Join(rootDir, "evaluation", startTime.Format("2006-01-02"), startTime.Format("15-04-05"))
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: failed to create output dir %s: %v\n", outputDir, err)
	}
	reportPath := filepath.Join(outputDir, "report.json")
	file, err := os.Create(reportPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: failed to create report file %s: %v\n", reportPath, err)
	} else {
		enc := json.NewEncoder(file)
		enc.SetIndent("", "  ")
		if encErr := enc.Encode(report); encErr != nil {
			fmt.Fprintf(os.Stderr, "ERROR: failed to write report: %v\n", encErr)
		}
		_ = file.Close()
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("EVALUATION SUMMARY")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("repository_after: %s (%d/%d passed)\n", map[bool]string{true: "SUCCESS", false: "FAILURE"}[verdictSuccess], afterResults.Summary.Passed, afterResults.Summary.Total)
	fmt.Printf("Requirements Satisfied:                  %d/%d\n", reportSummary.SatisfiedRequirements, reportSummary.TotalRequirements)
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("Full report saved to: %s\n", reportPath)

	os.Exit(0)
}