package tests

import (
	"flag"
	"fmt"
	"os"
	"runtime"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	flag.Parse()
	startTime = time.Now()
	fmt.Println("============================= test session starts ==============================")
	fmt.Printf("platform %s -- Go %s\n", runtime.GOOS, runtime.Version())
	fmt.Println("collected 9 items")
	fmt.Println()

	exitCode := m.Run()
	duration := time.Since(startTime).Seconds()

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
	fmt.Printf("%s ", testFile)
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
		fmt.Printf("FAILED %s::%s\n", testFile, r.Name)
	}
	if failed > 0 {
		fmt.Printf("========================= %d failed, %d passed in %.2fs =========================\n", failed, passed, duration)
	} else {
		fmt.Printf("========================= %d passed in %.2fs =========================\n", passed, duration)
	}

	os.Exit(exitCode)
}
