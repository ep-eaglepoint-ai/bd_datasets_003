package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type TestEvent struct {
	Time, Action, Package, Test, Output string
	Elapsed                             float64
}

type TestResult struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
}

type RepositoryAfter struct {
	Passed int          `json:"passed"`
	Failed int          `json:"failed"`
	Total  int          `json:"total"`
	Tests  []TestResult `json:"tests"`
}

type Report struct {
	Timestamp       string          `json:"timestamp"`
	RepositoryAfter RepositoryAfter `json:"repository_after"`
}

func formatTestName(name string) string {
	if strings.HasPrefix(name, "Test") {
		name = name[4:]
	}
	var result []rune
	for i, r := range name {
		if i > 0 && r >= 'A' && r <= 'Z' {
			result = append(result, ' ')
		}
		result = append(result, r)
	}
	return string(result)
}

func main() {
	fmt.Println("============================================================")
	fmt.Println("Ridehailing Proximity Streamer - Evaluation")
	fmt.Println("============================================================")

	tests := []TestResult{}
	passed, failed := 0, 0
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Text()
		var ev TestEvent
		if json.Unmarshal([]byte(line), &ev) != nil {
			continue
		}
		if ev.Test != "" && (ev.Action == "pass" || ev.Action == "fail") {
			isPassed := ev.Action == "pass"
			tests = append(tests, TestResult{
				Name:   formatTestName(ev.Test),
				Passed: isPassed,
			})
			if isPassed {
				passed++
			} else {
				failed++
			}
		}
	}
	total := passed + failed

	fmt.Printf("\n Evaluating repository_after...\n")
	fmt.Printf("    Passed: %d\n", passed)
	fmt.Printf("    Failed: %d\n", failed)

	projectRoot := os.Getenv("PROJECT_ROOT")
	if projectRoot == "" {
		cwd, _ := os.Getwd()
		projectRoot = cwd
	}
	baseEval := filepath.Join(projectRoot, "evaluation")
	os.MkdirAll(baseEval, 0755)

	now := time.Now()
	outputDir := filepath.Join(baseEval, now.Format("2006-01-02"), now.Format("15-04-05"))
	os.MkdirAll(outputDir, 0755)

	report := Report{
		Timestamp: now.Format("2006-01-02T15:04:05.000Z"),
		RepositoryAfter: RepositoryAfter{
			Passed: passed,
			Failed: failed,
			Total:  total,
			Tests:  tests,
		},
	}

	data, _ := json.MarshalIndent(report, "", "  ")
	os.WriteFile(filepath.Join(outputDir, "report.json"), data, 0644)

	fmt.Printf("\n============================================================\n")
	fmt.Println("EVALUATION SUMMARY")
	fmt.Println("============================================================")
	fmt.Printf("Total Tests: %d\n", total)
	fmt.Printf("Passed: %d\n", passed)
	fmt.Printf("Failed: %d\n", failed)
	if total > 0 {
		fmt.Printf("Success Rate: %.1f%%\n", float64(passed)/float64(total)*100)
	}
	if failed == 0 && total > 0 {
		fmt.Println("Overall: PASS")
	} else {
		fmt.Println("Overall: FAIL")
	}
	fmt.Println("============================================================")

	if failed > 0 || total == 0 {
		os.Exit(1)
	}
}
