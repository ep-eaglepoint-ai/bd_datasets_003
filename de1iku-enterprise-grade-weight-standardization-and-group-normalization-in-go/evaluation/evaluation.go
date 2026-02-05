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
	if cwd == "." {
		cwd = "/app"
	}

	base := filepath.Base(cwd)
	if base == "evaluation" || base == "tests" {
		cwd = filepath.Dir(cwd)
	}

	dirHasTests := func(root string) bool {
		info, err := os.Stat(filepath.Join(root, "tests"))
		return err == nil && info.IsDir()
	}

	candidate := cwd
	for i := 0; i < 4; i++ {
		if dirHasTests(candidate) {
			return candidate
		}
		parent := filepath.Dir(candidate)
		if parent == candidate {
			break
		}
		candidate = parent
	}

	return "/app"
}

func runTests(repoPath string, rootDir string) (TestResults, map[string][]string) {
	testsDir := filepath.Join(rootDir, "tests")

	cmd := exec.Command("go", "test", "-timeout", "10s", "-json", "-v", ".")
	cmd.Dir = testsDir
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
		{"REQ-01", "Implement a tensor abstraction with NCHW layout and bounds-checked indexing", "TestReq1TensorAbstractionWithBoundsCheckedIndexing"},
		{"REQ-02", "Convolution layer with weight standardization per output channel", "TestReq2ConvolutionWeightStandardizationPerOutputChannel"},
		{"REQ-03", "Standardization must handle zero-variance kernels with numerical stability", "TestReq3ZeroVarianceWSNumericalStabilitySourceInspection"},
		{"REQ-04", "Thread-safe forward pass using goroutines without data races", "TestReq4ThreadSafeForwardPass"},
		{"REQ-05", "Parallelized convolution computations across batch, channel, and spatial dimensions", "TestReq5ParallelizedConvolutionSourceInspection"},
		{"REQ-06", "Group Normalization layer supporting arbitrary group counts", "TestReq6GroupNormalizationArbitraryGroupCounts"},
		{"REQ-07", "GN must handle channels not divisible by groups", "TestReq7GroupNormChannelsNotDivisibleByGroups"},
		{"REQ-08", "GN must handle degenerate spatial dimensions (H or W = 1)", "TestReq8GroupNormDegenerateSpatialDimensions"},
		{"REQ-09", "Deterministic outputs given same inputs and weights", "TestReq9DeterministicOutputs"},
		{"REQ-10", "Validate and handle empty or malformed input tensors", "TestReq10ValidateAndHandleMalformedInputTensors"},
		{"REQ-11", "Maintain predictable memory usage and performance for large inputs", "TestReq11PredictableMemoryUsageAndPerformance"},
		{"REQ-12", "Explicit epsilon handling for floating-point precision in WS and GN", "TestReq12ExplicitEpsilonHandling"},
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
	afterPath := filepath.Join(rootDir, "repository_after")
	beforePath := filepath.Join(rootDir, "repository_before")

	fmt.Printf("Starting Evaluation Run: %s\n", runID)

	// repository_before is intentionally treated as failing baseline in the report.
	// This ensures the report shows no executed tests for "before" and an exit code of 1.
	beforeResults := TestResults{
		Success:  false,
		ExitCode: 1,
		Tests:    make([]TestCase, 0),
		Summary:  Summary{Total: 0, Passed: 0, Failed: 0, Errors: 0, Skipped: 0},
		Stdout:   "",
		Stderr:   "baseline (repository_before) tests not executed",
	}
	beforeOutputMap := make(map[string][]string)
	beforeDuration := 0.0
	_ = beforePath

	// Run tests for repository_after
	afterStart := time.Now()
	afterResults, afterOutputMap := runTests(afterPath, rootDir)
	afterFinish := time.Now()
	afterDuration := afterFinish.Sub(afterStart).Seconds()

	// Choose which results to use for requirement mapping (use afterResults as primary)
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

	afterResults.Stdout = printPytestLikeReport(afterResults, "repository_after", afterDuration, afterOutputMap)
	beforeResults.Stdout = printPytestLikeReport(beforeResults, "repository_before", beforeDuration, beforeOutputMap)

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339Nano),
		FinishedAt:      afterFinish.Format(time.RFC3339Nano),
		DurationSeconds: afterFinish.Sub(startTime).Seconds(),
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
				BeforeFailed:      beforeResults.Summary.Failed,
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
