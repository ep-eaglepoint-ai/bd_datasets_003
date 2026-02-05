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

// TestResult represents the results of a test run
type TestResult struct {
	Passed     bool   `json:"passed"`
	ReturnCode int    `json:"return_code"`
	Output     string `json:"output"`
}

// Metrics represents additional metrics (placeholder for future use)
type Metrics struct{}

// ImplementationResult represents results for before/after implementation
type ImplementationResult struct {
	Tests   TestResult `json:"tests"`
	Metrics Metrics    `json:"metrics"`
}

// Comparison represents the comparison between before and after
type Comparison struct {
	PassedGate         bool   `json:"passed_gate"`
	ImprovementSummary string `json:"improvement_summary"`
}

// Environment contains metadata about the execution environment
type Environment struct {
	GoVersion string `json:"go_version"`
	Platform  string `json:"platform"`
}

// Report is the top-level report structure
type Report struct {
	RunID           string                          `json:"run_id"`
	StartedAt       string                          `json:"started_at"`
	FinishedAt      string                          `json:"finished_at"`
	DurationSeconds float64                         `json:"duration_seconds"`
	Environment     Environment                     `json:"environment"`
	Before          ImplementationResult            `json:"before"`
	After           ImplementationResult            `json:"after"`
	Comparison      Comparison                      `json:"comparison"`
	Success         bool                            `json:"success"`
	Error           *string                         `json:"error"`
}

func generateRunID() string {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(b)
}

func getEnvironmentInfo() Environment {
	return Environment{
		GoVersion: runtime.Version(),
		Platform:  fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
	}
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

func runGoTestWithConfig(repoDirName, testsDir, label string) TestResult {
	fmt.Printf("\n%s\n", strings.Repeat("=", 100))
	fmt.Printf("RUNNING TESTS FOR: %s\n", strings.ToUpper(label))
	fmt.Printf("%s\n", strings.Repeat("=", 100))
	fmt.Printf("Target Repository Directory: %s\n", repoDirName)
	fmt.Printf("Tests directory: %s\n", testsDir)

	// Copy all test files from tests directory to repository directory
	testFiles := []string{"aggregator_test.go", "aggregator_bench_test.go"}
	var targetTestFiles []string
	
	for _, testFile := range testFiles {
		sourceFile := filepath.Join(testsDir, testFile)
		targetFile := filepath.Join(repoDirName, testFile)
		
		// Read test file content
		testContent, err := os.ReadFile(sourceFile)
		if err != nil {
			// If file doesn't exist, skip it (some repos might not have all test files)
			continue
		}
		
		// Write test file to repository directory
		err = os.WriteFile(targetFile, testContent, 0644)
		if err != nil {
			return TestResult{
				Passed:     false,
				ReturnCode: 1,
				Output:     "Failed to write test file " + testFile + ": " + err.Error(),
			}
		}
		
		targetTestFiles = append(targetTestFiles, targetFile)
	}
	
	// Clean up test files after execution
	defer func() {
		for _, targetFile := range targetTestFiles {
			os.Remove(targetFile)
		}
	}()

	// Run tests in the repository directory
	cmd := exec.Command("go", "test", "-v", "-race", ".")
	cmd.Dir = repoDirName
	cmd.Env = append(os.Environ(), "REDIS_ADDR=redis:6379")

	out, _ := cmd.CombinedOutput()
	output := string(out)

	// Determine exit code
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	tests := parseGoTestOutput(output)
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
		// Check if it's a build failure
		if strings.Contains(output, "[build failed]") || strings.Contains(output, "# ") {
			errors = 1
			fmt.Printf("\nBuild failed - this is expected for the 'before' implementation")
		} else {
			errors = 1
		}
	}

	fmt.Printf("\nResults: %d passed, %d failed, %d errors, %d skipped (total: %d)", 
		passed, failed, errors, skipped, len(tests))
	
	if exitCode != 0 && len(tests) == 0 {
		if strings.Contains(output, "[build failed]") {
			fmt.Printf(" - Build failed (compilation errors)")
		} else {
			fmt.Printf(" - Runtime error")
		}
	}
	fmt.Printf("\n")

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
	
	// If build failed, show that this was expected for the before implementation
	if exitCode != 0 && len(tests) == 0 && strings.Contains(output, "[build failed]") && strings.Contains(repoDirName, "before") {
		fmt.Printf("  ℹ️  Build failure is expected for the 'before' implementation\n")
	}

	testPassed := exitCode == 0 && len(tests) > 0 && failed == 0 && errors == 0

	return TestResult{
		Passed:     testPassed,
		ReturnCode: exitCode,
		Output:     truncate(output, 3000),
	}
}

func runEvaluation() (ImplementationResult, ImplementationResult, Comparison, error) {

	testsDir := "tests"
	
	// Run tests with BEFORE implementation
	beforeResult := runGoTestWithConfig("repository_before", testsDir, "before (repository_before)")
	
	// Run tests with AFTER implementation
	afterResult := runGoTestWithConfig("repository_after", testsDir, "after (repository_after)")

	// Print Summary
	fmt.Printf("\n%s\n", strings.Repeat("=", 100))
	fmt.Println("EVALUATION SUMMARY")
	fmt.Printf("%s\n", strings.Repeat("=", 100))

	fmt.Printf("\nBefore Implementation (repository_before):\n")
	beforeStatus := "❌ FAILED"
	if beforeResult.Passed {
		beforeStatus = "✅ PASSED"
	}
	fmt.Printf("  Overall: %s\n", beforeStatus)

	fmt.Printf("\nAfter Implementation (repository_after):\n")
	afterStatus := "❌ FAILED"
	if afterResult.Passed {
		afterStatus = "✅ PASSED"
	}
	fmt.Printf("  Overall: %s\n", afterStatus)

	// Determine expected behavior
	fmt.Printf("\n%s\n", strings.Repeat("=", 100))
	fmt.Println("EXPECTED BEHAVIOR CHECK")
	fmt.Printf("%s\n", strings.Repeat("=", 100))

	beforeFailed := !beforeResult.Passed
	afterPassed := afterResult.Passed

	if beforeFailed {
		fmt.Println("✅ Before implementation: Tests failed (expected)")
	} else {
		fmt.Println("⚠️  Before implementation: Tests passed (unexpected - should fail)")
	}

	if afterPassed {
		fmt.Println("✅ After implementation: All tests passed (expected)")
	} else {
		fmt.Println("❌ After implementation: Some tests failed (unexpected - should pass all)")
	}

	// Generate comparison summary
	passedGate := beforeFailed && afterPassed
	var improvementSummary string

	if passedGate {
		improvementSummary = "Repository after passes all correctness tests while repository before fails as expected."
	} else if afterPassed && !beforeFailed {
		improvementSummary = "Repository after passes all tests, but repository before also passes (unexpected)."
	} else if !afterPassed && beforeFailed {
		improvementSummary = "Repository before fails as expected, but repository after also fails (unexpected)."
	} else {
		improvementSummary = "Both repository before and after pass all tests (unexpected)."
	}

	beforeImpl := ImplementationResult{
		Tests:   beforeResult,
		Metrics: Metrics{},
	}

	afterImpl := ImplementationResult{
		Tests:   afterResult,
		Metrics: Metrics{},
	}

	comparison := Comparison{
		PassedGate:         passedGate,
		ImprovementSummary: improvementSummary,
	}

	return beforeImpl, afterImpl, comparison, nil
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[len(s)-n:]
	}
	return s
}

func main() {
	outputFlag := flag.String("output", "", "Output JSON file path (default: evaluation/YYYY-MM-DD/HH-MM-SS/report.json)")
	flag.Parse()

	runID := generateRunID()
	startedAt := time.Now()

	fmt.Printf("Run ID: %s\n", runID)
	fmt.Printf("Started at: %s\n", startedAt.Format(time.RFC3339))

	var beforeImpl ImplementationResult
	var afterImpl ImplementationResult
	var comparison Comparison
	var errStr *string

	func() {
		defer func() {
			if r := recover(); r != nil {
				s := fmt.Sprintf("%v", r)
				errStr = &s
			}
		}()

		var err error
		beforeImpl, afterImpl, comparison, err = runEvaluation()
		if err != nil {
			s := err.Error()
			errStr = &s
		}
	}()

	finishedAt := time.Now()
	duration := finishedAt.Sub(startedAt).Seconds()

	// Success if after implementation passes all tests
	success := afterImpl.Tests.Passed

	if !success && errStr == nil {
		s := "After implementation tests failed"
		errStr = &s
	}

	// Build the report
	report := Report{
		RunID:           runID,
		StartedAt:       startedAt.Format(time.RFC3339),
		FinishedAt:      finishedAt.Format(time.RFC3339),
		DurationSeconds: duration,
		Environment:     getEnvironmentInfo(),
		Before:          beforeImpl,
		After:           afterImpl,
		Comparison:      comparison,
		Success:         success,
		Error:           errStr,
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

	fmt.Printf("\n%s\n", strings.Repeat("=", 100))
	fmt.Println("EVALUATION COMPLETE")
	fmt.Printf("%s\n", strings.Repeat("=", 100))
	fmt.Printf("Run ID: %s\n", runID)
	fmt.Printf("Duration: %.2fs\n", duration)
	successStr := "❌ NO"
	if success {
		successStr = "✅ YES"
	}
	fmt.Printf("Success: %s\n", successStr)

	if !success {
		os.Exit(1)
	}
}