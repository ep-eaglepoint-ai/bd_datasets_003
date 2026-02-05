package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type TestResult struct {
	Name     string
	Passed   bool
	Message  string
	Duration time.Duration
}

var (
	startTime   time.Time
	testResults []TestResult
)

func main() {
	flag.Parse()
	startTime = time.Now()

	fmt.Println("============================= test session starts ==============================")
	fmt.Printf("platform %s -- Go %s\n", runtime.GOOS, runtime.Version())
	fmt.Println()

	repoPath := os.Getenv("REPO_PATH")
	if repoPath == "" {
		repoPath = "repository_after"
	}

	// Run all tests
	backendSuccess := runBackendTests()
	frontendSuccess := runFrontendTests()

	// Unified summary
	duration := time.Since(startTime)
	passed := 0
	failed := 0
	var failedTests []TestResult

	for _, r := range testResults {
		if r.Passed {
			passed++
		} else {
			failed++
			failedTests = append(failedTests, r)
		}
	}

	fmt.Printf("\n=== UNIFIED TEST RESULTS ===\n")
	fmt.Printf("Tests ")
	for _, r := range testResults {
		if r.Passed {
			fmt.Print(".")
		} else {
			fmt.Print("F")
		}
	}
	fmt.Printf(" [100%%]\n\n")

	if len(failedTests) > 0 {
		fmt.Println("=================================== FAILURES ===================================")
		for _, r := range failedTests {
			fmt.Printf("_________________________________ %s _________________________________\n", r.Name)
			if r.Message != "" {
				fmt.Printf("    %s\n", r.Message)
			}
			fmt.Println()
		}
	}

	fmt.Println("=========================== short test summary info ============================")
	for _, r := range failedTests {
		fmt.Printf("FAILED %s\n", r.Name)
	}

	if failed > 0 {
		fmt.Printf("========================= %d failed, %d passed in %.2fs =========================\n", failed, passed, duration.Seconds())
		os.Exit(1)
	} else {
		fmt.Printf("========================= %d passed in %.2fs =========================\n", passed, duration.Seconds())
	}

	// Exit with error if either backend or frontend failed
	if !backendSuccess || !frontendSuccess {
		os.Exit(1)
	}
}

func runBackendTests() bool {
	fmt.Println("=== Running Backend Tests ===")
	backendTestsDir := "backend"
	cmd := exec.Command("go", "test", "-timeout", "30s", "-v", "./...")
	cmd.Dir = backendTestsDir
	cmd.Env = append(os.Environ(), fmt.Sprintf("REPO_PATH=%s", os.Getenv("REPO_PATH")))

	output, err := cmd.CombinedOutput()
	outputStr := string(output)

	// Parse test results
	lines := strings.Split(outputStr, "\n")
	for _, line := range lines {
		if strings.Contains(line, "--- PASS:") {
			testName := strings.TrimSpace(strings.Split(line, "--- PASS:")[1])
			testName = strings.Split(testName, " ")[0]
			testResults = append(testResults, TestResult{
				Name:   "backend::" + testName,
				Passed: true,
			})
		} else if strings.Contains(line, "--- FAIL:") {
			testName := strings.TrimSpace(strings.Split(line, "--- FAIL:")[1])
			testName = strings.Split(testName, " ")[0]
			testResults = append(testResults, TestResult{
				Name:    "backend::" + testName,
				Passed:  false,
				Message: "Backend test failed",
			})
		}
	}

	// If compilation failed, add a general failure
	if err != nil && len(testResults) == 0 {
		testResults = append(testResults, TestResult{
			Name:    "backend::compilation",
			Passed:  false,
			Message: fmt.Sprintf("Backend compilation failed: %v", err),
		})
	}

	fmt.Print(outputStr)
	return err == nil
}

func runFrontendTests() bool {
	fmt.Println("\n=== Running Frontend Tests ===")
	frontendTestsDir := "ui"

	cmd := exec.Command("npm", "test")
	cmd.Dir = frontendTestsDir
	cmd.Env = append(os.Environ(), fmt.Sprintf("REPO_PATH=%s", os.Getenv("REPO_PATH")))

	output, err := cmd.CombinedOutput()
	outputStr := string(output)

	if err != nil {
		testResults = append(testResults, TestResult{
			Name:    "frontend::setup",
			Passed:  false,
			Message: fmt.Sprintf("Frontend test setup failed: %v", err),
		})
		fmt.Printf("Frontend tests failed: %v\n", err)
		fmt.Print(outputStr)
		return false
	}

	// Parse Jest results more accurately
	lines := strings.Split(outputStr, "\n")
	testCount := 0
	for _, line := range lines {
		if strings.Contains(line, "✓") {
			testCount++
			testResults = append(testResults, TestResult{
				Name:   fmt.Sprintf("frontend::test_%d", testCount),
				Passed: true,
			})
		} else if strings.Contains(line, "✗") {
			testCount++
			testResults = append(testResults, TestResult{
				Name:    fmt.Sprintf("frontend::test_%d", testCount),
				Passed:  false,
				Message: "Frontend test failed",
			})
		}
	}

	// If no specific test results found, add a general result
	if testCount == 0 {
		testResults = append(testResults, TestResult{
			Name:   "frontend::all_tests",
			Passed: err == nil,
		})
	}

	fmt.Print(outputStr)
	return err == nil
}

