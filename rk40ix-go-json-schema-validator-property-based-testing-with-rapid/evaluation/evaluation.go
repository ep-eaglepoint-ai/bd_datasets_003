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

func main() {
	start := time.Now()
	rootDir := getRootDir()
	reportDir := newReportDir(rootDir, start)
	if err := os.MkdirAll(reportDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "failed to create report dir: %v\n", err)
		os.Exit(1)
	}

	beforePath := filepath.Join(rootDir, "repository_before")
	afterPath := filepath.Join(rootDir, "repository_after")

	before := runTests(beforePath, rootDir)
	after := runTests(afterPath, rootDir)

	comparison := Comparison{
		BeforeTestsPassed: before.Success,
		AfterTestsPassed:  after.Success,
		BeforeTotal:       before.Summary.Total,
		BeforePassed:      before.Summary.Passed,
		BeforeFailed:      before.Summary.Failed,
		AfterTotal:        after.Summary.Total,
		AfterPassed:       after.Summary.Passed,
		AfterFailed:       after.Summary.Failed,
	}

	report := Report{
		RunID:           randomID(),
		StartedAt:       start.UTC().Format(time.RFC3339Nano),
		FinishedAt:      time.Now().UTC().Format(time.RFC3339Nano),
		DurationSeconds: time.Since(start).Seconds(),
		Success:         after.Success,
		Error:           nil,
		Environment:     getEnvironmentInfo(),
		Results: Results{
			Before:     &before,
			After:      &after,
			Comparison: comparison,
		},
	}

	outPath := filepath.Join(reportDir, "report.json")
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to marshal report: %v\n", err)
		os.Exit(1)
	}
	if err := os.WriteFile(outPath, data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "failed to write report: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("report written to %s\n", outPath)
}

func randomID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
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
	return cwd
}

func newReportDir(rootDir string, t time.Time) string {
	date := t.Format("2006-01-02")
	timeStamp := t.Format("15-04-05")
	return filepath.Join(rootDir, "evaluation", date, timeStamp)
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

func runTests(repoPath string, rootDir string) TestResults {
	testsDir := filepath.Join(rootDir, "tests")
	cmd := exec.Command("go", "test", "-timeout", "60s", "-json", "-v", ".")
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
	stderrDone := make(chan struct{})
	go func() {
		stderrBytes, _ = io.ReadAll(stderrPipe)
		close(stderrDone)
	}()

	statusMap := make(map[string]string)
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
		}
	}

	_ = stdoutPipe.Close()
	err = cmd.Wait()
	<-stderrDone
	stderr := string(stderrBytes)

	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			exitCode = 1
		}
	}

	tests := make([]TestCase, 0, len(order))
	summary := Summary{}
	for _, name := range order {
		outcome := statusMap[name]
		summary.Total++
		switch outcome {
		case "passed":
			summary.Passed++
		case "failed":
			summary.Failed++
		case "skipped":
			summary.Skipped++
		}
		tests = append(tests, TestCase{
			NodeID:  fmt.Sprintf("meta-tests::%s", name),
			Name:    name,
			Outcome: outcome,
		})
	}

	return TestResults{
		Success:  exitCode == 0,
		ExitCode: exitCode,
		Tests:    tests,
		Summary:  summary,
		Stdout:   stdoutBuilder.String(),
		Stderr:   stderr,
	}
}

func errorResult(message string) TestResults {
	return TestResults{
		Success:  false,
		ExitCode: 1,
		Tests:    nil,
		Summary:  Summary{},
		Stdout:   "",
		Stderr:   message,
	}
}
