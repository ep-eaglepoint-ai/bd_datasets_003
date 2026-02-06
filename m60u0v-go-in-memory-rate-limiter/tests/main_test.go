package tests

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"
)

type TestResult struct {
	Name    string
	Passed  bool
	Message string
}

var (
	testResults []TestResult
	testFile    = "/app/tests"
	startTime   time.Time
)

func TestMain(m *testing.M) {
	flag.Parse()
	startTime = time.Now()

	out, exitCode := runAndCapture(m)
	testResults = parseTestResults(out)

	fmt.Println("============================= test session starts ==============================")
	fmt.Printf("platform %s -- Go %s\n", runtime.GOOS, runtime.Version())
	fmt.Printf("collected %d items\n", len(testResults))
	fmt.Println()
	if len(testResults) == 0 {
		fmt.Println("note: no test results parsed; ensure tests run with -v output")
		fmt.Println()
	}

	printSummary(testResults, time.Since(startTime).Seconds())

	os.Exit(exitCode)
}

func runAndCapture(m *testing.M) (string, int) {
	origStdout := os.Stdout
	origStderr := os.Stderr

	rOut, wOut, _ := os.Pipe()
	rErr, wErr, _ := os.Pipe()

	os.Stdout = wOut
	os.Stderr = wErr

	outCh := make(chan []byte, 1)
	errCh := make(chan []byte, 1)

	go func() {
		b, _ := io.ReadAll(rOut)
		outCh <- b
	}()
	go func() {
		b, _ := io.ReadAll(rErr)
		errCh <- b
	}()

	exitCode := m.Run()

	_ = wOut.Close()
	_ = wErr.Close()

	outBytes := <-outCh
	errBytes := <-errCh

	os.Stdout = origStdout
	os.Stderr = origStderr

	combined := string(outBytes) + string(errBytes)
	combined = strings.TrimRight(combined, "\n")
	if combined != "" {
		fmt.Println(combined)
	}

	return combined, exitCode
}

func parseTestResults(output string) []TestResult {
	resultsByName := map[string]*TestResult{}
	order := make([]string, 0, 32)
	current := ""

	scanner := bufio.NewScanner(strings.NewReader(output))
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "=== RUN") {
			name := strings.TrimSpace(strings.TrimPrefix(line, "=== RUN"))
			current = name
			if _, ok := resultsByName[name]; !ok {
				resultsByName[name] = &TestResult{Name: name}
				order = append(order, name)
			}
			continue
		}

		if strings.HasPrefix(line, "--- PASS:") {
			name := extractTestName(line, "--- PASS:")
			if r, ok := resultsByName[name]; ok {
				r.Passed = true
			}
			current = ""
			continue
		}

		if strings.HasPrefix(line, "--- FAIL:") {
			name := extractTestName(line, "--- FAIL:")
			if r, ok := resultsByName[name]; ok {
				r.Passed = false
			}
			current = ""
			continue
		}

		if strings.HasPrefix(line, "--- SKIP:") {
			name := extractTestName(line, "--- SKIP:")
			if r, ok := resultsByName[name]; ok {
				r.Passed = true
			}
			current = ""
			continue
		}

		if isIndented(line) && current != "" {
			if r, ok := resultsByName[current]; ok && r.Message == "" {
				r.Message = strings.TrimSpace(line)
			}
		}
	}

	results := make([]TestResult, 0, len(order))
	for _, name := range order {
		results = append(results, *resultsByName[name])
	}
	return results
}

func extractTestName(line, prefix string) string {
	namePart := strings.TrimSpace(strings.TrimPrefix(line, prefix))
	fields := strings.Fields(namePart)
	if len(fields) == 0 {
		return ""
	}
	return fields[0]
}

func isIndented(line string) bool {
	return strings.HasPrefix(line, "\t") || strings.HasPrefix(line, "    ")
}

func printSummary(results []TestResult, duration float64) {
	passed := 0
	failed := 0
	var failedTests []TestResult

	fmt.Printf("%s ", testFile)
	for _, r := range results {
		if r.Passed {
			fmt.Print(".")
			passed++
		} else {
			fmt.Print("F")
			failed++
			failedTests = append(failedTests, r)
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
}
