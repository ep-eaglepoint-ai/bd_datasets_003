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

// Metrics represents additional metrics
type Metrics struct {
	AvgTimeMs      float64 `json:"avg_time_ms"`
	P95TimeMs      float64 `json:"p95_time_ms"`
	Failures       int     `json:"failures"`
	FailureRate    float64 `json:"failure_rate"`
	Deadlocks      int     `json:"deadlocks"`
	OpsPerSecond   float64 `json:"ops_per_second"`
	RowsProcessed  int     `json:"rows_processed"`
	Warnings       int     `json:"warnings"`
}

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

func parseGoTestOutput(output string) ([]Test, []float64) {
	var tests []Test
	var durations []float64
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
				// Extract duration if present (e.g., "TestName (0.00s)")
				if strings.Contains(name, "(") && strings.Contains(name, "s)") {
					startIdx := strings.Index(name, "(")
					endIdx := strings.Index(name, "s)")
					if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
						durationStr := name[startIdx+1 : endIdx]
						if duration, err := time.ParseDuration(durationStr + "s"); err == nil {
							durations = append(durations, float64(duration.Milliseconds()))
						}
					}
					// Remove duration from name
					name = strings.TrimSpace(name[:startIdx])
				} else if spaceIdx := strings.Index(name, " "); spaceIdx != -1 {
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
	return tests, durations
}

func calculateMetrics(tests []Test, durations []float64, executionTimeMs float64) Metrics {
	totalTests := len(tests)
	passed := 0
	failed := 0
	errors := 0
	
	for _, t := range tests {
		switch t.Outcome {
		case "passed":
			passed++
		case "failed":
			failed++
		default:
			errors++
		}
	}
	
	totalFailures := failed + errors
	
	// Calculate average and p95 from test durations
	var avgTimeMs, p95TimeMs float64
	if len(durations) > 0 {
		sum := 0.0
		for _, d := range durations {
			sum += d
		}
		avgTimeMs = sum / float64(len(durations))
		
		// Calculate p95
		sortedDurations := make([]float64, len(durations))
		copy(sortedDurations, durations)
		// Simple bubble sort for small arrays
		for i := 0; i < len(sortedDurations); i++ {
			for j := i + 1; j < len(sortedDurations); j++ {
				if sortedDurations[i] > sortedDurations[j] {
					sortedDurations[i], sortedDurations[j] = sortedDurations[j], sortedDurations[i]
				}
			}
		}
		p95Index := int(float64(len(sortedDurations)) * 0.95)
		if p95Index >= len(sortedDurations) {
			p95Index = len(sortedDurations) - 1
		}
		p95TimeMs = sortedDurations[p95Index]
	} else if totalTests > 0 {
		// Fallback: estimate from total execution time
		avgTimeMs = executionTimeMs / float64(totalTests)
		p95TimeMs = avgTimeMs * 1.5
	}
	
	// Calculate ops per second (tests per second)
	executionTimeSeconds := executionTimeMs / 1000.0
	opsPerSecond := 0.0
	if executionTimeSeconds > 0 {
		opsPerSecond = float64(totalTests) / executionTimeSeconds
	}
	
	// Calculate failure rate
	failureRate := 0.0
	if totalTests > 0 {
		failureRate = float64(totalFailures) / float64(totalTests)
	}
	
	return Metrics{
		AvgTimeMs:     roundFloat(avgTimeMs, 1),
		P95TimeMs:     roundFloat(p95TimeMs, 1),
		Failures:      totalFailures,
		FailureRate:   roundFloat(failureRate, 2),
		Deadlocks:     0, // Would need specific detection logic
		OpsPerSecond:  roundFloat(opsPerSecond, 1),
		RowsProcessed: totalTests,
		Warnings:      0, // Would need to parse warnings
	}
}

func roundFloat(val float64, precision int) float64 {
	ratio := float64(1)
	for i := 0; i < precision; i++ {
		ratio *= 10
	}
	return float64(int(val*ratio+0.5)) / ratio
}

func runGoTestWithConfig(repoDirName, testsDir, label string) (TestResult, Metrics) {
	fmt.Printf("\n%s\n", strings.Repeat("=", 100))
	fmt.Printf("RUNNING TESTS FOR: %s\n", strings.ToUpper(label))
	fmt.Printf("%s\n", strings.Repeat("=", 100))
	fmt.Printf("Target Repository Directory: %s\n", repoDirName)
	fmt.Printf("Tests directory: %s\n", testsDir)

	// Copy all test files from tests directory to repository directory
	testFiles := []string{"circuit_breaker_test.go", "fast_circuit_breaker_test.go"}
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
			emptyMetrics := Metrics{
				AvgTimeMs:     0,
				P95TimeMs:     0,
				Failures:      0,
				FailureRate:   0.0,
				Deadlocks:     0,
				OpsPerSecond:  0,
				RowsProcessed: 0,
				Warnings:      0,
			}
			return TestResult{
				Passed:     false,
				ReturnCode: 1,
				Output:     "Failed to write test file " + testFile + ": " + err.Error(),
			}, emptyMetrics
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
	startTime := time.Now()
	cmd := exec.Command("go", "test", "-v", "-race", ".")
	cmd.Dir = repoDirName
	cmd.Env = append(os.Environ(), "REDIS_ADDR=redis:6379")

	out, _ := cmd.CombinedOutput()
	executionTimeMs := float64(time.Since(startTime).Milliseconds())
	output := string(out)

	// Determine exit code
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	tests, durations := parseGoTestOutput(output)
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
	
	// Calculate metrics
	metrics := calculateMetrics(tests, durations, executionTimeMs)

	return TestResult{
		Passed:     testPassed,
		ReturnCode: exitCode,
		Output:     truncate(output, 3000),
	}, metrics
}

func runEvaluation() (ImplementationResult, ImplementationResult, Comparison, error) {

	testsDir := "tests"
	
	// Run tests with BEFORE implementation
	beforeResult, beforeMetrics := runGoTestWithConfig("repository_before", testsDir, "before (repository_before)")
	
	// Run tests with AFTER implementation
	afterResult, afterMetrics := runGoTestWithConfig("repository_after", testsDir, "after (repository_after)")

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

	afterPassed := afterResult.Passed

	if afterPassed {
		fmt.Println("✅ After implementation: All tests passed (expected)")
	} else {
		fmt.Println("❌ After implementation: Some tests failed (unexpected - should pass all)")
	}

	// Generate comparison summary
	passedGate := afterPassed
	var improvementSummary string

	if passedGate {
		improvementSummary = "Repository after passes all correctness tests."
	} else {
		improvementSummary = "Repository after failed some tests."
	}

	beforeImpl := ImplementationResult{
		Tests:   beforeResult,
		Metrics: beforeMetrics,
	}

	afterImpl := ImplementationResult{
		Tests:   afterResult,
		Metrics: afterMetrics,
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