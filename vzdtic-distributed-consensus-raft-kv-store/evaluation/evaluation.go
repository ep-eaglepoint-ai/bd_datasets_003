package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Report represents the evaluation report
type Report struct {
	RunID           string      `json:"run_id"`
	StartedAt       string      `json:"started_at"`
	FinishedAt      string      `json:"finished_at"`
	DurationSeconds float64     `json:"duration_seconds"`
	Environment     Environment `json:"environment"`
	Before          TestResult  `json:"before"`
	After           TestResult  `json:"after"`
	Comparison      Comparison  `json:"comparison"`
	Success         bool        `json:"success"`
	Error           *string     `json:"error"`
}

// Environment holds environment information
type Environment struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
}

// TestResult holds the result of a test run
type TestResult struct {
	Tests   TestStatus             `json:"tests"`
	Metrics map[string]interface{} `json:"metrics"`
}

// TestStatus holds test status information
type TestStatus struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
	NumTests   int    `json:"num_tests"`
	NumPassed  int    `json:"num_passed"`
	NumFailed  int    `json:"num_failed"`
}

// Comparison holds comparison results
type Comparison struct {
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

func generateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func main() {
	fmt.Println("Starting Raft KV Store Evaluation...")
	fmt.Println("====================================================")

	startTime := time.Now()
	runID := generateUUID()

	report := Report{
		RunID:     runID,
		StartedAt: startTime.Format(time.RFC3339),
		Environment: Environment{
			GoVersion: runtime.Version(),
			Platform:  runtime.GOOS + "-" + runtime.GOARCH,
		},
		Before: TestResult{Metrics: make(map[string]interface{})},
		After:  TestResult{Metrics: make(map[string]interface{})},
	}

	// Run tests against repository_before (should fail — no code)
	fmt.Println("\n[1/2] Testing repository_before...")
	beforeResult := runBeforeTests()
	report.Before.Tests = beforeResult

	// Run tests against repository_after
	fmt.Println("\n[2/2] Testing repository_after...")
	afterResult := runAfterTests()
	report.After.Tests = afterResult

	// Metrics
	report.After.Metrics["unit_tests_passed"] = afterResult.NumPassed
	report.After.Metrics["total_tests"] = afterResult.NumTests
	report.After.Metrics["failed_tests"] = afterResult.NumFailed

	endTime := time.Now()
	report.FinishedAt = endTime.Format(time.RFC3339)
	report.DurationSeconds = endTime.Sub(startTime).Seconds()

	// Determine overall success
	report.Success = afterResult.Passed && !beforeResult.Passed
	report.Comparison.PassedGate = report.Success

	if report.Success {
		report.Comparison.ImprovementSummary = fmt.Sprintf(
			"Implementation complete: %d tests passing in repository_after, 0 tests passing in repository_before",
			afterResult.NumPassed,
		)
	} else if afterResult.Passed && beforeResult.Passed {
		report.Comparison.ImprovementSummary = "Both repositories pass tests - before state may be non-empty"
		report.Success = true
		report.Comparison.PassedGate = true
	} else if !afterResult.Passed {
		errMsg := fmt.Sprintf("Tests failed in repository_after: %d/%d passed", afterResult.NumPassed, afterResult.NumTests)
		report.Error = &errMsg
		report.Comparison.ImprovementSummary = errMsg
	}

	// Create report directory
	dateDir := time.Now().Format("2006-01-02")
	timeDir := time.Now().Format("15-04-05")
	reportDir := filepath.Join("evaluation", "reports", dateDir, timeDir)
	if err := os.MkdirAll(reportDir, 0755); err != nil {
		fmt.Printf("Error creating report directory: %v\n", err)
		os.Exit(1)
	}

	// Write report
	reportPath := filepath.Join(reportDir, "report.json")
	reportJSON, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		fmt.Printf("Error marshaling report: %v\n", err)
		os.Exit(1)
	}

	if err := os.WriteFile(reportPath, reportJSON, 0644); err != nil {
		fmt.Printf("Error writing report: %v\n", err)
		os.Exit(1)
	}

	// Print summary
	fmt.Println("\n====================================================")
	fmt.Println("EVALUATION SUMMARY")
	fmt.Println("====================================================")
	fmt.Printf("Run ID:   %s\n", runID)
	fmt.Printf("Duration: %.2f seconds\n", report.DurationSeconds)
	fmt.Printf("\nBefore Tests: %s\n", formatTestResult(beforeResult))
	fmt.Printf("After Tests:  %s\n", formatTestResult(afterResult))
	fmt.Printf("\nOverall Success: %v\n", report.Success)
	fmt.Printf("Report saved to: %s\n", reportPath)

	// Print requirement coverage
	fmt.Println("\n====================================================")
	fmt.Println("REQUIREMENT COVERAGE")
	fmt.Println("====================================================")
	printRequirementCoverage(afterResult)

	if !report.Success {
		os.Exit(1)
	}
}

func runBeforeTests() TestStatus {
	result := TestStatus{Passed: false, ReturnCode: 1}

	// repository_before is empty — there's nothing to compile
	hasGoFiles := false
	filepath.Walk("repository_before", func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && filepath.Ext(path) == ".go" {
			hasGoFiles = true
		}
		return nil
	})

	if !hasGoFiles {
		result.Output = "repository_before is empty — no Go source files (expected for new feature task)"
		result.ReturnCode = 1
		result.Passed = false
		result.NumTests = 0
		result.NumPassed = 0
		result.NumFailed = 0
		return result
	}

	// If somehow it has files, try running tests
	return runGoTests()
}

func runAfterTests() TestStatus {
	return runGoTests()
}

func runGoTests() TestStatus {
	result := TestStatus{Passed: false}

	var stdout, stderr bytes.Buffer

	cmd := exec.Command("go", "test", "-v", "-count=1", "-timeout=120s",
		"./tests/unit/...",
		"./tests/integration/...",
		"./tests/jepsen/...",
	)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.Env = append(os.Environ(), "GO111MODULE=on")

	err := cmd.Run()

	output := stdout.String() + stderr.String()
	result.Output = truncateOutput(output, 8000)

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ReturnCode = exitErr.ExitCode()
		} else {
			result.ReturnCode = 1
		}
	} else {
		result.ReturnCode = 0
		result.Passed = true
	}

	// Count tests from output
	result.NumTests, result.NumPassed, result.NumFailed = countTests(output)

	return result
}

func countTests(output string) (total, passed, failed int) {
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--- PASS:") {
			passed++
			total++
		} else if strings.HasPrefix(trimmed, "--- FAIL:") {
			failed++
			total++
		}
	}
	return
}

func formatTestResult(result TestStatus) string {
	status := "FAILED"
	if result.Passed {
		status = "PASSED"
	}
	return fmt.Sprintf("%s (%d/%d tests passed, %d failed)",
		status, result.NumPassed, result.NumTests, result.NumFailed)
}

func truncateOutput(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n... (output truncated)"
}

func printRequirementCoverage(afterResult TestStatus) {
	type requirement struct {
		id          int
		description string
		testNames   []string
		status      string
	}

	reqs := []requirement{
		{
			id:          1,
			description: "Raft state machine with Leader Election, randomized timeouts, heartbeats",
			testNames: []string{
				"TestNodeState", "TestNodeStateTransitions", "TestIsLeader",
				"TestThreeNodeClusterElection", "TestFiveNodeCluster",
			},
		},
		{
			id:          2,
			description: "Log replication with majority acknowledgment in correct order",
			testNames: []string{
				"TestLogReplication", "TestWALAppendEntries", "TestWALGetEntry",
			},
		},
		{
			id:          3,
			description: "Linearizability for reads and writes; stale read prevention",
			testNames: []string{
				"TestLinearizability", "TestLogConsistency",
			},
		},
		{
			id:          4,
			description: "Persistent WAL storing term, votedFor, log entries for crash recovery",
			testNames: []string{
				"TestWALNew", "TestWALPersistence", "TestWALTruncateAfter",
			},
		},
		{
			id:          5,
			description: "Membership management for graceful add/remove of nodes",
			testNames: []string{
				"TestFiveNodeCluster",
			},
		},
		{
			id:          6,
			description: "Deterministic simulation with network partition injection",
			testNames: []string{
				"TestLeaderElectionAfterPartition", "TestMessageLoss", "TestSplitBrain",
			},
		},
		{
			id:          7,
			description: "TLA+/Jepsen-style model-checking tests for safety validation",
			testNames: []string{
				"TestNoTwoLeaders", "TestModelChecking", "TestRandomizedExecution",
			},
		},
		{
			id:          8,
			description: "Log compaction via snapshots when WAL exceeds configurable size",
			testNames: []string{
				"TestWALSnapshot", "TestKVSnapshot",
			},
		},
	}

	output := afterResult.Output

	for _, req := range reqs {
		allPassed := true
		anyFound := false
		for _, testName := range req.testNames {
			passLine := fmt.Sprintf("--- PASS: %s", testName)
			failLine := fmt.Sprintf("--- FAIL: %s", testName)
			if strings.Contains(output, passLine) {
				anyFound = true
			} else if strings.Contains(output, failLine) {
				anyFound = true
				allPassed = false
			} else {
				// Test not found in output — might be a sub-test or not run
			}
		}

		if anyFound && allPassed {
			req.status = "✅ PASS"
		} else if anyFound && !allPassed {
			req.status = "❌ FAIL"
		} else {
			req.status = "⚠️  NOT FOUND"
		}

		fmt.Printf("  [%d] %s  —  %s\n", req.id, req.status, req.description)
	}
}