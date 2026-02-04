package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
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

func createGoWork(testsDir string, repoPath string) error {
	// We need to point to the repo. Since tests are in /app/tests and repos are in /app/repository_*,
	// we calculate relative path or use absolute.
	// content:
	// go 1.21
	// use (
	//     .
	//     <repoPath>
	// )
	
	workContent := fmt.Sprintf("go 1.25.5\n\nuse (\n\t.\n\t%s\n)\n", repoPath)
	return os.WriteFile(filepath.Join(testsDir, "go.work"), []byte(workContent), 0644)
}

func runTests(repoPath string, rootDir string) (TestResults, map[string][]string) {
	testsDir := filepath.Join(rootDir, "tests")

	// Create go.work in tests directory to force resolution to the specific repo
	err := createGoWork(testsDir, repoPath)
	if err != nil {
		return errorResult(fmt.Sprintf("failed to configure workspace: %v", err))
	}
	defer os.Remove(filepath.Join(testsDir, "go.work"))

	testArgs := []string{"test", "-timeout", "10s", "-json", "-v", "."}
	
	// Add build tag for repository_after
	if strings.Contains(repoPath, "repository_after") {
		testArgs = []string{"test", "-tags", "after", "-timeout", "10s", "-json", "-v", "."}
	}
	
	cmd := exec.Command("go", testArgs...)
	cmd.Dir = testsDir
	// REPO_PATH env is still useful if tests use it for specific logic, though go.work handles imports
	cmd.Env = append(os.Environ(), fmt.Sprintf("REPO_PATH=%s", repoPath))

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return errorResult(fmt.Sprintf("stdout pipe error: %v", err))
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return errorResult(fmt.Sprintf("stderr pipe error: %v", err))
	}

	if err := cmd.Start(); err != nil {
		return errorResult(fmt.Sprintf("start error: %v", err))
	}

	var stdoutBuilder strings.Builder
	var stderrBytes []byte
	var stderrErr error
	stderrDone := make(chan struct{})
	go func() {
		stderrBytes, stderrErr = io.ReadAll(stderrPipe)
		close(stderrDone)
	}()

	// Read stdout in main goroutine to avoid deadlock: go test blocks on stdout write
	// when buffer fills; we must consume stdout while the process runs.

	statusMap := make(map[string]string)
	packageMap := make(map[string]string)
	outputMap := make(map[string][]string)
	order := make([]string, 0, 64)

	scanner := bufio.NewScanner(stdoutPipe)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 2*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		stdoutBuilder.WriteString(line)
		stdoutBuilder.WriteString("\n")

		var ev goTestEvent
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			continue
		}
		if ev.Test == "" {
			continue
		}
		if ev.Action == "output" {
			outputMap[ev.Test] = append(outputMap[ev.Test], ev.Output)
			continue
		}
		if ev.Action == "pass" || ev.Action == "fail" || ev.Action == "skip" {
			outcome := ev.Action
			if outcome == "pass" {
				outcome = "passed"
			} else if outcome == "fail" {
				outcome = "failed"
			} else if outcome == "skip" {
				outcome = "skipped"
			}

			if _, ok := statusMap[ev.Test]; !ok {
				order = append(order, ev.Test)
			}
			statusMap[ev.Test] = outcome
			packageMap[ev.Test] = ev.Package
		}
	}

	_ = stdoutPipe.Close()
	err = cmd.Wait()
	<-stderrDone
	if stderrErr != nil {
		stderrBytes = []byte{}
	}
	stderr := string(stderrBytes)

	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = 2
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
		Stdout:   stdoutBuilder.String(),
		Stderr:   stderr,
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
		test string
	}{
		{"REQ-01", "Compute per-channel, per-sample mean and standard deviation correctly", "TestReq1_MeanStdCalculation"},
		{"REQ-02", "Support optional spatial masking for both content and style", "TestReq2_MaskingSupport"},
		{"REQ-03", "Preserve alpha-based blending with the original content", "TestReq3_AlphaBlending"},
		{"REQ-04", "Produce numerically equivalent outputs within floating-point tolerance", "TestReq4_NumericalEquivalence"},
		{"REQ-05", "Avoid deeply nested loops where possible", "TestReq5_AvoidNestedLoops"},
		{"REQ-06", "Minimize repeated indexing and memory accesses", "TestReq6_MinimizingIndexing"},
		{"REQ-07", "Reduce unnecessary heap allocations and temporary arrays", "TestReq7_Allocations"},
		{"REQ-08", "Ensure spatial and temporal cache locality for better performance", "TestReq8_SpatialLocalityAndPerformance"},
		{"REQ-09", "Handle zero-mask and edge cases without NaN or Inf", "TestReq9_ZeroMaskAndEdgeCases"},
		{"REQ-10", "Maintain deterministic behavior for identical inputs", "TestReq10_DeterministicBehavior"},
		{"REQ-11", "Include proper shape validation and error handling", "TestReq11_ValidationErrors"},
		{"REQ-12", "Modular and readable structure with descriptive naming", "TestReq12_ModularStructureAndNaming"},
	}

	testOutcomes := make(map[string]string)
	for _, t := range afterResults.Tests {
		testOutcomes[t.Name] = t.Outcome
	}

	result := make([]RequirementStatus, 0)
	satisfied := 0

	for _, r := range reqs {
		outcome := testOutcomes[r.test]
		status := "FAIL"
		if outcome == "passed" {
			status = "PASS"
			satisfied++
		}
		result = append(result, RequirementStatus{
			ID:          r.id,
			Description: r.desc,
			Status:      status,
			Checks:      []string{r.test},
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
	beforePath := filepath.Join(rootDir, "repository_before")
	afterPath := filepath.Join(rootDir, "repository_after")

	fmt.Printf("Starting Evaluation Run: %s\n", runID)

	// Run Before Tests
	fmt.Println("Running tests for repository_before...")
	beforeResults, _ := runTests(beforePath, rootDir)

	// Run After Tests
	fmt.Println("Running tests for repository_after...")
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

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339Nano),
		FinishedAt:      finishTime.Format(time.RFC3339Nano),
		DurationSeconds: duration,
		Success:         verdictSuccess,
		Error:           errMsg,
		Environment:     getEnvironmentInfo(),
		Results: Results{
			Before: &beforeResults,
			After:  &afterResults,
			Comparison: Comparison{
				BeforeTestsPassed: beforeResults.Success,
				BeforeTotal:       beforeResults.Summary.Total,
				BeforePassed:      beforeResults.Summary.Passed,
				BeforeFailed:      beforeResults.Summary.Failed + beforeResults.Summary.Errors,
				AfterTestsPassed:  afterResults.Success,
				AfterTotal:        afterResults.Summary.Total,
				AfterPassed:       afterResults.Summary.Passed,
				AfterFailed:       afterResults.Summary.Failed + afterResults.Summary.Errors,
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
	fmt.Printf("repository_before: %s (%d/%d passed)\n", map[bool]string{true: "SUCCESS", false: "FAILURE"}[beforeResults.Success], beforeResults.Summary.Passed, beforeResults.Summary.Total)
	fmt.Printf("repository_after:  %s (%d/%d passed)\n", map[bool]string{true: "SUCCESS", false: "FAILURE"}[verdictSuccess], afterResults.Summary.Passed, afterResults.Summary.Total)
	fmt.Printf("Requirements Satisfied:                  %d/%d\n", reportSummary.SatisfiedRequirements, reportSummary.TotalRequirements)
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("Full report saved to: %s\n", reportPath)

	os.Exit(0)
}
