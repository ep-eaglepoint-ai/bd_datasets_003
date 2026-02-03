package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Test represents an individual test result
type Test struct {
	NodeID  string `json:"nodeid"`
	Name    string `json:"name"`
	Outcome string `json:"outcome"`
}

// Summary represents the test run summary
type Summary struct {
	Total   int `json:"total"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	Errors  int `json:"errors"`
	Skipped int `json:"skipped"`
}

// Result represents the results of a test run on a repository
type Result struct {
	Success  bool    `json:"success"`
	ExitCode int     `json:"exit_code"`
	Tests    []Test  `json:"tests"`
	Summary  Summary `json:"summary"`
	Stdout   string  `json:"stdout"`
	Stderr   string  `json:"stderr"`
}

// Environment contains metadata about the execution environment
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

// Report is the top-level report structure
type Report struct {
	RunID           string            `json:"run_id"`
	StartedAt       string            `json:"started_at"`
	FinishedAt      string            `json:"finished_at"`
	DurationSeconds float64           `json:"duration_seconds"`
	Success         bool              `json:"success"`
	Error           *string           `json:"error"`
	Environment     Environment       `json:"environment"`
	Results         map[string]Result `json:"results"`
}

func generateRunID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(b)
}

func getGitInfo() (commit, branch string) {
	commit = "unknown"
	branch = "unknown"

	cmd := exec.Command("git", "rev-parse", "HEAD")
	out, err := cmd.Output()
	if err == nil {
		commit = strings.TrimSpace(string(out))
		if len(commit) > 8 {
			commit = commit[:8]
		}
	}

	cmd = exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	out, err = cmd.Output()
	if err == nil {
		branch = strings.TrimSpace(string(out))
	}

	return commit, branch
}

func getEnvironmentInfo() Environment {
	commit, branch := getGitInfo()
	hostname, _ := os.Hostname()

	envInfo := Environment{
		GoVersion:    runtime.Version(),
		Platform:     fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
		OS:           runtime.GOOS,
		OSRelease:    "unknown",
		Architecture: runtime.GOARCH,
		Hostname:     hostname,
		GitCommit:    commit,
		GitBranch:    branch,
	}

	// Try to get OS release
	if runtime.GOOS == "windows" {
		out, err := exec.Command("cmd", "/c", "ver").Output()
		if err == nil {
			envInfo.OSRelease = strings.TrimSpace(string(out))
		}
	} else {
		out, err := exec.Command("uname", "-r").Output()
		if err == nil {
			envInfo.OSRelease = strings.TrimSpace(string(out))
		}
	}

	return envInfo
}

func parseGoTestOutput(output string) []Test {
	var tests []Test
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		var outcome string
		var prefix string

		if strings.Contains(line, "--- PASS:") {
			outcome = "passed"
			prefix = "--- PASS:"
		} else if strings.Contains(line, "--- FAIL:") {
			outcome = "failed"
			prefix = "--- FAIL:"
		} else if strings.Contains(line, "--- SKIP:") {
			outcome = "skipped"
			prefix = "--- SKIP:"
		}

		if outcome != "" {
			name := line
			idx := strings.Index(line, prefix)
			if idx != -1 {
				name = strings.TrimSpace(line[idx+len(prefix):])
				// Name might have (0.00s) at the end
				if spaceIdx := strings.Index(name, " "); spaceIdx != -1 {
					name = name[:spaceIdx]
				}
			}
			tests = append(tests, Test{
				NodeID:  name,
				Name:    name,
				Outcome: outcome,
			})
		}
	}
	return tests
}

func runGoTestWithConfig(repoDirName, testsDir, label string) Result {
	fmt.Printf("\n%s\n", strings.Repeat("=", 60))
	fmt.Printf("RUNNING TESTS: %s\n", strings.ToUpper(label))
	fmt.Printf("%s\n", strings.Repeat("=", 60))
	fmt.Printf("Target Repository Directory: %s\n", repoDirName)
	fmt.Printf("Tests directory: %s\n", repoDirName)

	cmd := exec.Command("go", "test", "-v", "-race", "./"+repoDirName+"/...")
	cmd.Env = append(os.Environ(), "REDIS_ADDR=redis:6379")

	out, _ := cmd.CombinedOutput()
	stdout := string(out)
	fmt.Println(stdout) // Debug: Print raw output

	// Determine exit code
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	tests := parseGoTestOutput(stdout)
	passed := 0
	failed := 0
	skipped := 0
	errors := 0

	for _, t := range tests {
		switch t.Outcome {
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

	// If go test failed but no tests were parsed, it's likely a build/runtime error
	if exitCode != 0 && len(tests) == 0 {
		errors = 1
	}

	fmt.Printf("\nResults: %d passed, %d failed, %d errors, %d skipped (total: %d)\n",
		passed, failed, errors, skipped, len(tests))

	for _, t := range tests {
		icon := "❓"
		switch t.Outcome {
		case "passed":
			icon = "✅"
		case "failed":
			icon = "❌"
		case "skipped":
			icon = "⏭️"
		}
		fmt.Printf("  %s %s: %s\n", icon, t.NodeID, t.Outcome)
	}

	return Result{
		Success:  exitCode == 0 && len(tests) > 0,
		ExitCode: exitCode,
		Tests:    tests,
		Summary: Summary{
			Total:   len(tests),
			Passed:  passed,
			Failed:  failed,
			Errors:  errors,
			Skipped: skipped,
		},
		Stdout: truncate(stdout, 3000),
		Stderr: "",
	}
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[len(s)-n:]
	}
	return s
}

func main() {
	outputFlag := flag.String("output", "", "Output JSON file path")
	flag.Parse()

	runID := generateRunID()
	startedAt := time.Now()

	fmt.Printf("Run ID: %s\n", runID)
	fmt.Printf("Started at: %s\n", startedAt.Format(time.RFC3339))

	var results map[string]Result
	var errStr *string

	func() {
		defer func() {
			if r := recover(); r != nil {
				s := fmt.Sprintf("%v", r)
				errStr = &s
			}
		}()

		fmt.Printf("\n%s\n", strings.Repeat("=", 60))
		fmt.Println("Chat Message Aggregation Evaluation")
		fmt.Printf("%s\n", strings.Repeat("=", 60))

		testsDir := "tests"
		results = make(map[string]Result)
		results["before"] = runGoTestWithConfig("repository_before", testsDir, "before (repository_before)")
		results["after"] = runGoTestWithConfig("repository_after", testsDir, "after (repository_after)")
	}()

	finishedAt := time.Now()
	duration := finishedAt.Sub(startedAt).Seconds()

	success := false
	if results != nil {
		if after, ok := results["after"]; ok {
			success = after.Success
		}
	}

	if !success && errStr == nil {
		s := "After implementation tests failed"
		errStr = &s
	}

	// Print Summary
	fmt.Printf("\n%s\n", strings.Repeat("=", 60))
	fmt.Println("EVALUATION SUMMARY")
	fmt.Printf("%s\n", strings.Repeat("=", 60))

	if res, ok := results["before"]; ok {
		fmt.Printf("\nBefore Implementation (repository_before):\n")
		status := "❌ FAILED"
		if res.Success {
			status = "✅ PASSED"
		}
		fmt.Printf("  Overall: %s\n", status)
	}

	if res, ok := results["after"]; ok {
		fmt.Printf("\nAfter Implementation (repository_after):\n")
		status := "❌ FAILED"
		if res.Success {
			status = "✅ PASSED"
		}
		fmt.Printf("  Overall: %s\n", status)
	}

	fmt.Printf("\n%s\n", strings.Repeat("=", 60))
	fmt.Println("EXPECTED BEHAVIOR CHECK")
	fmt.Printf("%s\n", strings.Repeat("=", 60))

	if success {
		fmt.Println("✅ After implementation: All tests passed (expected)")
	} else {
		fmt.Println("❌ After implementation: Some tests failed (unexpected - should pass all)")
	}

	// Build the report
	report := Report{
		RunID:           runID,
		StartedAt:       startedAt.Format(time.RFC3339),
		FinishedAt:      finishedAt.Format(time.RFC3339),
		DurationSeconds: duration,
		Success:         success,
		Error:           errStr,
		Environment:     getEnvironmentInfo(),
		Results:         results,
	}

	// Determine output path
	outputPath := *outputFlag
	if outputPath == "" {
		if envPath := os.Getenv("REPORT_PATH"); envPath != "" {
			outputPath = envPath
		} else {
			dateStr := startedAt.Format("2006-01-02")
			timeStr := startedAt.Format("15-04-05")
			outputPath = filepath.Join("evaluation", dateStr, timeStr, "report.json")
		}
	}

	// Save report
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err == nil {
		if file, err := json.MarshalIndent(report, "", "  "); err == nil {
			os.WriteFile(outputPath, file, 0644)
			fmt.Printf("\n✅ Report saved to: %s\n", outputPath)
		}
	}

	fmt.Printf("\n%s\n", strings.Repeat("=", 60))
	fmt.Println("EVALUATION COMPLETE")
	fmt.Printf("%s\n", strings.Repeat("=", 60))
	fmt.Printf("Run ID: %s\n", runID)
	fmt.Printf("Duration: %.2fs\n", duration)
	successStr := "❌ NO"
	if success {
		successStr = "✅ YES"
	}
	fmt.Printf("Success: %s\n", successStr)
}
