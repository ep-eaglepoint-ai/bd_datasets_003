package tests

import (
	"flag"
	"os"
	"strings"
	"time"
)

var repoPathFlag = flag.String("repo", "", "Path to repository_after")
var testResults []TestResult
var testFile = "/app/tests"
var startTime time.Time

type TestResult struct {
	Name    string
	Passed  bool
	Message string
}

func RecordResult(name string, passed bool, message string) {
	testResults = append(testResults, TestResult{Name: name, Passed: passed, Message: message})
}

func GetRepoPath() string {
	var raw string
	if *repoPathFlag != "" {
		raw = *repoPathFlag
	} else if envPath := os.Getenv("REPO_PATH"); envPath != "" {
		raw = envPath
	} else {
		raw = "/app/repository_after"
	}
	if idx := strings.LastIndex(raw, "/app/"); idx >= 0 {
		raw = "/app/" + raw[idx+5:]
	}
	return raw
}
