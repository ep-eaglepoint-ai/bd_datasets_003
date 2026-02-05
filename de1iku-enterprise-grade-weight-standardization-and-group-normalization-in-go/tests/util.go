package tests

import (
	"path/filepath"
)

var testResults []TestResult
var testFile = "/app/tests"

type TestResult struct {
	Name    string
	Passed  bool
	Message string
}

func RecordResult(name string, passed bool, message string) {
	testResults = append(testResults, TestResult{Name: name, Passed: passed, Message: message})
}

func MainGoPath() string {
	// Tests are designed to run against the single target repo: ../repository_after.
	return filepath.Join("..", "repository_after", "main.go")
}

func abs32(x float32) float32 {
	if x < 0 {
		return -x
	}
	return x
}

func floatsAlmostEqual(a, b, tol float32) bool {
	return abs32(a-b) <= tol
}
