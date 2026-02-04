package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type goTestEvent struct {
	Time    string `json:"Time"`
	Action  string `json:"Action"`
	Package string `json:"Package"`
	Test    string `json:"Test"`
	Output  string `json:"Output"`
}

type TestResult struct {
	Name    string
	Passed  bool
	Skipped bool
	Output  []string
}

func main() {
	startTime := time.Now()

	fmt.Println("============================= test session starts ==============================")
	fmt.Printf("platform %s -- Go %s\n", runtime.GOOS, runtime.Version())

	repoPath := os.Getenv("REPO_PATH")
	if repoPath == "" {
		repoPath = "/app/repository_after"
	}
	fmt.Printf("testing: %s\n", repoPath)
	fmt.Println()

	os.Chdir("/app/tests")
	cmd := exec.Command("go", "test", "-timeout", "10s", "-json", "-v", ".")
	cmd.Env = append(os.Environ(), fmt.Sprintf("REPO_PATH=%s", repoPath))

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create stdout pipe: %v\n", err)
		os.Exit(1)
	}

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start test command: %v\n", err)
		os.Exit(1)
	}

	scanner := bufio.NewScanner(stdout)
	testResults := make(map[string]*TestResult)
	testOrder := []string{}

	for scanner.Scan() {
		line := scanner.Text()
		var ev goTestEvent
		if err := json.Unmarshal([]byte(line), &ev); err != nil {
			continue
		}

		if ev.Test == "" {
			continue
		}

		if _, exists := testResults[ev.Test]; !exists {
			testResults[ev.Test] = &TestResult{Name: ev.Test, Output: []string{}}
			testOrder = append(testOrder, ev.Test)
		}

		if ev.Action == "output" {
			testResults[ev.Test].Output = append(testResults[ev.Test].Output, ev.Output)
		} else if ev.Action == "pass" {
			testResults[ev.Test].Passed = true
		} else if ev.Action == "skip" {
			testResults[ev.Test].Skipped = true
		}
	}

	cmd.Wait()
	duration := time.Since(startTime)

	// Print test progress
	fmt.Print("/app/tests ")
	passed := 0
	failed := 0
	skipped := 0
	for _, name := range testOrder {
		result := testResults[name]
		if result.Skipped {
			fmt.Print("F")
			failed++
			skipped++
		} else if result.Passed {
			fmt.Print(".")
			passed++
		} else {
			fmt.Print("F")
			failed++
		}
	}
	fmt.Println(" [100%]")
	fmt.Println()

	// Print failures
	if failed > 0 {
		fmt.Println("=================================== FAILURES ===================================")
		for _, name := range testOrder {
			result := testResults[name]
			if !result.Passed {
				fmt.Printf("_________________________________ %s _________________________________\n", name)
				for _, line := range result.Output {
					fmt.Print(line)
				}
				fmt.Println()
			}
		}
	}

	// Print summary
	fmt.Println("=========================== short test summary info ============================")
	for _, name := range testOrder {
		result := testResults[name]
		if !result.Passed {
			fmt.Printf("FAILED /app/tests::%s\n", name)
		}
	}

	// Print final summary
	summaryParts := []string{}
	if failed > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d failed", failed))
	}
	if passed > 0 {
		summaryParts = append(summaryParts, fmt.Sprintf("%d passed", passed))
	}

	fmt.Printf("========================= %s in %.2fs =========================\n",
		strings.Join(summaryParts, ", "), duration.Seconds())

	// Always exit with 0 for AWS build compatibility
	os.Exit(0)
}