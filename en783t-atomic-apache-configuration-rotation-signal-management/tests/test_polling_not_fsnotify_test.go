package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestUsesPollingNotFsnotify verifies that the implementation uses time.Ticker for polling
// and does not use fsnotify (prompt: "strictly forbidden from using fsnotify";
// "must implement an efficient polling mechanism using time.Ticker").
func TestUsesPollingNotFsnotify(t *testing.T) {
	repoPath := GetRepoPath()

	// Forbidden: no fsnotify
	var foundFsnotify []string
	err := filepath.Walk(repoPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(string(data), "fsnotify") {
			foundFsnotify = append(foundFsnotify, path)
		}
		return nil
	})
	if err != nil {
		RecordResult("TestUsesPollingNotFsnotify", false, err.Error())
		t.Fatal(err)
	}
	if len(foundFsnotify) > 0 {
		RecordResult("TestUsesPollingNotFsnotify", false, "fsnotify is forbidden; use time.Ticker polling: "+strings.Join(foundFsnotify, ", "))
		t.Fatalf("source must not use fsnotify; use time.Ticker for polling: %s", strings.Join(foundFsnotify, ", "))
	}

	// Required: run loop uses Ticker (main.go creates it, automator.go uses it)
	automatorPath := filepath.Join(repoPath, "automator.go")
	automatorData, err := os.ReadFile(automatorPath)
	if err != nil {
		RecordResult("TestUsesPollingNotFsnotify", false, err.Error())
		t.Fatal(err)
	}
	if !strings.Contains(string(automatorData), "Ticker") {
		RecordResult("TestUsesPollingNotFsnotify", false, "automator must use time.Ticker for polling")
		t.Fatal("automator.go must use Ticker for polling (e.g. case <-a.Ticker.C)")
	}

	mainPath := filepath.Join(repoPath, "main.go")
	mainData, err := os.ReadFile(mainPath)
	if err != nil {
		RecordResult("TestUsesPollingNotFsnotify", false, err.Error())
		t.Fatal(err)
	}
	if !strings.Contains(string(mainData), "Ticker") {
		RecordResult("TestUsesPollingNotFsnotify", false, "main must create time.Ticker for polling")
		t.Fatal("main.go must create time.Ticker for polling")
	}

	RecordResult("TestUsesPollingNotFsnotify", true, "")
}
