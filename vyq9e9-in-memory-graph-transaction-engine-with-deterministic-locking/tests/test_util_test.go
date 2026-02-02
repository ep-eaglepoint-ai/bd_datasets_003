package tests

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
	"time"

	"repository_after"
)

// Tx is the transaction interface used by tests (repository_after implements it).
type Tx interface {
	Read(nodeID string) (int64, error)
	Write(nodeID string, delta int64) error
	Commit() error
}

var testResults []testResult
var testFile = "/app/tests"

type testResult struct {
	name    string
	passed  bool
	message string
}

func recordResult(name string, passed bool, message string) {
	testResults = append(testResults, testResult{name: name, passed: passed, message: message})
}

func getRepoPath() string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "repository_after")
}

func getManager(t *testing.T) *repository_after.TransactionManager {
	return repository_after.NewTransactionManager()
}

// readRepoSource returns the contents of transaction_manager.go in repository_after. Caller must not modify.
func readRepoSource(t *testing.T) string {
	fp := filepath.Join(getRepoPath(), "transaction_manager.go")
	content, err := os.ReadFile(fp)
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	return string(content)
}

// TestMain provides pytest-style output.
func TestMain(m *testing.M) {
	start := time.Now()
	fmt.Println("============================= test session starts ==============================")
	fmt.Printf("platform %s -- Go %s\n", runtime.GOOS, runtime.Version())
	fmt.Println("collected 12 items")
	fmt.Println()

	exitCode := m.Run()
	duration := time.Since(start).Seconds()

	sort.Slice(testResults, func(i, j int) bool { return testResults[i].name < testResults[j].name })
	passed := 0
	failed := 0
	var failedTests []testResult
	for _, r := range testResults {
		if r.passed {
			passed++
		} else {
			failed++
			failedTests = append(failedTests, r)
		}
	}

	fmt.Printf("%s ", testFile)
	for _, r := range testResults {
		if r.passed {
			fmt.Print(".")
		} else {
			fmt.Print("F")
		}
	}
	fmt.Printf(" [100%%]\n\n")

	if len(failedTests) > 0 {
		fmt.Println("=================================== FAILURES ===================================")
		for _, r := range failedTests {
			fmt.Printf("_________________________________ %s _________________________________\n", r.name)
			if r.message != "" {
				fmt.Printf("    %s\n", r.message)
			}
			fmt.Println()
		}
	}
	fmt.Println("=========================== short test summary info ============================")
	for _, r := range failedTests {
		fmt.Printf("FAILED %s::%s\n", testFile, r.name)
	}
	if failed > 0 {
		fmt.Printf("========================= %d failed, %d passed in %.2fs =========================\n", failed, passed, duration)
	} else {
		fmt.Printf("========================= %d passed in %.2fs =========================\n", passed, duration)
	}

	os.Exit(exitCode)
}
