package main

import (
	"bufio"
	"crypto/rand"
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
	Class    string `json:"class"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	FullName string `json:"full_name"`
}

type Summary struct {
	Total   int `json:"total"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	XFailed int `json:"xfailed"`
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
	BeforeXFailed     int  `json:"before_xfailed"`
	BeforeSkipped     int  `json:"before_skipped"`
	BeforeErrors      int  `json:"before_errors"`
	AfterTotal        int  `json:"after_total"`
	AfterPassed       int  `json:"after_passed"`
	AfterFailed       int  `json:"after_failed"`
	AfterXFailed      int  `json:"after_xfailed"`
	AfterSkipped      int  `json:"after_skipped"`
	AfterErrors       int  `json:"after_errors"`
	Improvement       struct {
		TestsFixed    int `json:"tests_fixed"`
		FeaturesAdded int `json:"features_added"`
	} `json:"improvement"`
}

type Results struct {
	Before     *TestResults `json:"before"`
	After      *TestResults `json:"after"`
	Comparison Comparison   `json:"comparison"`
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

func updateGoMod(rootDir string, repoPath string) error {
	goModPath := filepath.Join(rootDir, "tests", "go.mod")
	content := fmt.Sprintf(`module github.com/example/connpool/tests

go 1.21

require github.com/example/connpool v0.0.0

replace github.com/example/connpool => %s
`, repoPath)
	if err := os.WriteFile(goModPath, []byte(content), 0644); err != nil {
		return err
	}

	tidyCmd := exec.Command("go", "mod", "tidy")
	tidyCmd.Dir = filepath.Join(rootDir, "tests")
	tidyCmd.Env = os.Environ()
	_ = tidyCmd.Run() // Best effort

	return nil
}

func runTests(repoPath string, rootDir string, isXFail bool) (TestResults, map[string][]string) {
	testsDir := filepath.Join(rootDir, "tests")

	if err := updateGoMod(rootDir, repoPath); err != nil {
		return errorResult(fmt.Sprintf("failed to update go.mod: %v", err))
	}

	cmd := exec.Command("go", "test", "-timeout", "30s", "-json", "-v", ".")
	cmd.Dir = testsDir
	cmd.Env = os.Environ()

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
		pkg := packageMap[testName]
		if pkg == "" {
			pkg = "connpool_test"
		}
		if isXFail {
			if outcome == "failed" {
				outcome = "xfailed"
			} else if outcome == "passed" {
				outcome = "failed" // Failure to verify bug
			}
		}

		results = append(results, TestCase{
			Class:    pkg,
			Name:     testName,
			Status:   outcome,
			FullName: fmt.Sprintf("%s::%s", pkg, testName),
		})

		switch outcome {
		case "passed":
			summary.Passed++
		case "failed":
			summary.Failed++
		case "xfailed":
			summary.XFailed++
		case "skipped":
			summary.Skipped++
		}
	}

	if exitCode != 0 && summary.Failed == 0 && summary.XFailed == 0 {
		summary.Errors = 1
	}

	summary.Total = summary.Passed + summary.Failed + summary.XFailed + summary.Errors + summary.Skipped

	logicalSuccess := exitCode == 0 && summary.Failed == 0 && summary.Errors == 0
	if isXFail {
		// For before run, success means we successfully verified some bugs (XFailed)
		// and didn't have any unexpected Passes or Errors.
		logicalSuccess = summary.XFailed > 0 && summary.Failed == 0 && summary.Errors == 0
	}
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
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	uuid := fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
	return uuid
}

func main() {
	startTime := time.Now()
	runID := generateRunID()
	
	rootDir, err := os.Getwd()
	if err != nil {
		rootDir = "/app"
	}
	if filepath.Base(rootDir) == "evaluation" {
		rootDir = filepath.Dir(rootDir)
	}

	afterPath := filepath.Join(rootDir, "repository_after")
	beforePath := filepath.Join(rootDir, "repository_before")

	fmt.Printf("Starting Evaluation Run: %s\n", runID)

	beforeResults, _ := runTests(beforePath, rootDir, true)
	afterResults, _ := runTests(afterPath, rootDir, false)

	verdictSuccess := afterResults.Success
	var errMsg *string
	if !verdictSuccess {
		msg := "One or more requirements failed"
		if afterResults.Summary.Errors > 0 {
			msg = "Evaluation error: " + afterResults.Stderr
		}
		errMsg = &msg
	} else if !beforeResults.Success {
		// If before failed to verify bugs, it might still be a successful run if after is good,
		// but we should probably note it.
		// For now, we follow the user's lead: success = after is success.
	}

	report := Report{
		RunID:           runID,
		StartedAt:       startTime.Format(time.RFC3339Nano),
		FinishedAt:      time.Now().Format(time.RFC3339Nano),
		DurationSeconds: time.Since(startTime).Seconds(),
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
				BeforeXFailed:     beforeResults.Summary.XFailed,
				BeforeSkipped:     beforeResults.Summary.Skipped,
				BeforeErrors:      beforeResults.Summary.Errors,
				AfterTestsPassed:  afterResults.Success,
				AfterTotal:        afterResults.Summary.Total,
				AfterPassed:       afterResults.Summary.Passed,
				AfterFailed:       afterResults.Summary.Failed,
				AfterXFailed:      afterResults.Summary.XFailed,
				AfterSkipped:      afterResults.Summary.Skipped,
				AfterErrors:       afterResults.Summary.Errors,
			},
		},
	}
	report.Results.Comparison.Improvement.TestsFixed = afterResults.Summary.Passed - beforeResults.Summary.Passed
	if report.Results.Comparison.Improvement.TestsFixed < 0 {
		report.Results.Comparison.Improvement.TestsFixed = 0
	}
	report.Results.Comparison.Improvement.FeaturesAdded = report.Results.Comparison.Improvement.TestsFixed

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
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("Full report saved to: %s\n", reportPath)

	os.Exit(0)
}
