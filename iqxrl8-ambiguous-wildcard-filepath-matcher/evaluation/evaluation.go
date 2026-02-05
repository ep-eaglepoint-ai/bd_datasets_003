package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type testCase struct {
	Name    string `json:"name"`
	Outcome string `json:"outcome"` // passed|failed|error|skipped
}

type runResults struct {
	Success  bool       `json:"success"`
	ExitCode int        `json:"exit_code"`
	Tests    []testCase `json:"tests"`
	Output   string     `json:"output"`
}

type goTestEvent struct {
	Time    string  `json:"Time"`
	Action  string  `json:"Action"`  // run|pass|fail|skip|output
	Package string  `json:"Package"`
	Test    string  `json:"Test"`    // empty for package-level
	Output  string  `json:"Output"`  // may contain newlines
	Elapsed float64 `json:"Elapsed"` // optional
}

const maxOutputLen = 65536

func main() {
	// Evaluator must never fail the harness.
	defer func() {
		if r := recover(); r != nil {
			_, _ = fmt.Fprintln(os.Stderr, "evaluation: unhandled panic")
			os.Exit(0)
		}
	}()

	projectRoot, err := os.Getwd()
	if err != nil {
		projectRoot = "."
	}

	outputPath := filepath.Join(projectRoot, "evaluation", "report.json")
	timeoutS := 120

	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--output":
			if i+1 < len(args) {
				provided := args[i+1]
				i++
				if filepath.IsAbs(provided) {
					outputPath = provided
				} else {
					outputPath = filepath.Join(projectRoot, provided)
				}
			}
		case "--timeout":
			if i+1 < len(args) {
				v := args[i+1]
				i++
				if n, perr := parsePositiveInt(v); perr == nil {
					timeoutS = n
				}
			}
		}
	}

	runID := generateRunID()
	_, _ = fmt.Fprintf(os.Stdout, "Starting Wildcard Matcher Evaluation [Run ID: %s]\n", runID)

	before := (*runResults)(nil)
	if isRunnableGoRepo(filepath.Join(projectRoot, "repository_before")) {
		rr := runGoTests(filepath.Join(projectRoot, "repository_before"), timeoutS)
		before = &rr
	}
	after := runGoTests(projectRoot, timeoutS)

	if err := writeReportJSON(outputPath, runID, before, after); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "evaluation: failed to write report: %v\n", err)
	}
	_, _ = fmt.Fprintf(os.Stdout, "Report saved to: %s\n", outputPath)

	// ALWAYS exit 0.
	os.Exit(0)
}

func parsePositiveInt(s string) (int, error) {
	var n int
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return 0, fmt.Errorf("not an int")
		}
		n = n*10 + int(c-'0')
		if n > 1_000_000 {
			return 0, fmt.Errorf("too large")
		}
	}
	if n <= 0 {
		return 0, fmt.Errorf("must be > 0")
	}
	return n, nil
}

func generateRunID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		// best-effort fallback
		return fmt.Sprintf("%08x", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func truncateOutput(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	tail := "\n...<truncated>...\n"
	keep := maxLen - len(tail)
	if keep < 0 {
		return s[:maxLen]
	}
	return s[:keep] + tail
}

func isRunnableGoRepo(dir string) bool {
	st, err := os.Stat(dir)
	if err != nil || !st.IsDir() {
		return false
	}
	if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
		return true
	}
	return false
}

func runGoTests(cwd string, timeoutS int) runResults {
	rr := runResults{Success: false, ExitCode: -1, Tests: []testCase{}, Output: ""}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(max(1, timeoutS))*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "go", "test", "-json", "./tests")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "GOTOOLCHAIN=auto")

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		rr.Tests = append(rr.Tests, testCase{Name: "runner", Outcome: "error"})
		rr.Output = truncateOutput(fmt.Sprintf("failed to get stdout pipe: %v\n", err), maxOutputLen)
		return rr
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		rr.Tests = append(rr.Tests, testCase{Name: "runner", Outcome: "error"})
		rr.Output = truncateOutput(fmt.Sprintf("failed to get stderr pipe: %v\n", err), maxOutputLen)
		return rr
	}

	if err := cmd.Start(); err != nil {
		rr.Tests = append(rr.Tests, testCase{Name: "runner", Outcome: "error"})
		rr.Output = truncateOutput(fmt.Sprintf("failed to start: %v\n", err), maxOutputLen)
		return rr
	}

	// Merge stderr into output buffer while JSON is read from stdout.
	var outputBuilder strings.Builder
	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		_, _ = io.Copy(&outputBuilder, stderrPipe)
	}()

	// Parse JSON lines from stdout.
	outcomeByTest := make(map[string]string, 128) // name -> passed|failed|skipped
	packageFailed := make(map[string]bool, 16)

	scanner := bufio.NewScanner(stdoutPipe)
	// Allow larger lines (verbose output can be big).
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		outputBuilder.Write(line)
		outputBuilder.WriteByte('\n')

		var ev goTestEvent
		if err := json.Unmarshal(line, &ev); err != nil {
			continue
		}
		// Track package-level fail as an error marker.
		if ev.Test == "" {
			if ev.Action == "fail" {
				packageFailed[ev.Package] = true
			}
			continue
		}
		name := ev.Package + ":" + ev.Test
		switch ev.Action {
		case "pass":
			outcomeByTest[name] = "passed"
		case "fail":
			outcomeByTest[name] = "failed"
		case "skip":
			outcomeByTest[name] = "skipped"
		}
	}
	if err := scanner.Err(); err != nil {
		rr.Tests = append(rr.Tests, testCase{Name: "runner", Outcome: "error"})
		outputBuilder.WriteString(fmt.Sprintf("scanner error: %v\n", err))
	}

	waitErr := cmd.Wait()
	<-stderrDone

	outStr := truncateOutput(outputBuilder.String(), maxOutputLen)
	rr.Output = outStr

	rr.ExitCode = exitCodeFromErr(waitErr)

	// Convert collected results to rr.Tests.
	for name, outcome := range outcomeByTest {
		rr.Tests = append(rr.Tests, testCase{Name: name, Outcome: outcome})
	}
	for pkg := range packageFailed {
		// If package failed but we didn't get any explicit failed tests, still record an error.
		rr.Tests = append(rr.Tests, testCase{Name: "package:" + pkg, Outcome: "error"})
	}

	// Determine success.
	if len(rr.Tests) == 0 {
		rr.Tests = append(rr.Tests, testCase{Name: "runner", Outcome: "error"})
		rr.Success = false
		return rr
	}
	rr.Success = true
	for _, tc := range rr.Tests {
		if tc.Outcome == "failed" || tc.Outcome == "error" {
			rr.Success = false
			break
		}
	}
	// Timeout -> mark explicit error.
	if isTimeoutErr(waitErr) {
		rr.Success = false
		rr.Tests = append(rr.Tests, testCase{Name: "timeout", Outcome: "error"})
	}

	return rr
}

func exitCodeFromErr(err error) int {
	if err == nil {
		return 0
	}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		return ee.ExitCode()
	}
	return -1
}

func isTimeoutErr(err error) bool {
	if err == nil {
		return false
	}
	// context deadline exceeded or explicit timeout strings
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "deadline") || strings.Contains(msg, "timeout") || strings.Contains(msg, "killed")
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

type report struct {
	RunID       string      `json:"run_id"`
	Tool        string      `json:"tool"`
	StartedAt   string      `json:"started_at"`
	Environment environment `json:"environment"`
	Before      *runResults `json:"before"`
	After       runResults  `json:"after"`
}

type environment struct {
	OS        string `json:"os"`
	Platform  string `json:"platform"`
	Go        string `json:"go"`
	GitCommit string `json:"git_commit"`
	GitBranch string `json:"git_branch"`
	Arch      string `json:"arch"`
}

func writeReportJSON(path string, runID string, before *runResults, after runResults) error {
	now := time.Now().UTC().Format(time.RFC3339)

	rep := report{
		RunID:     runID,
		Tool:      "Wildcard Path Matcher Evaluator",
		StartedAt: now,
		Environment: environment{
			OS:        "linux",
			Platform:  oneLine("uname", "-a"),
			Go:        oneLine("go", "version"),
			GitCommit: short(oneLine("git", "rev-parse", "HEAD"), 8),
			GitBranch: oneLine("git", "rev-parse", "--abbrev-ref", "HEAD"),
			Arch:      runtime.GOARCH,
		},
		Before: before,
		After:  after,
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(rep, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0o644)
}

func oneLine(cmd string, args ...string) string {
	o, err := exec.Command(cmd, args...).CombinedOutput()
	if err != nil {
		return "unknown"
	}
	line := strings.SplitN(string(o), "\n", 2)[0]
	return strings.TrimSpace(line)
}

func short(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n]
}
