package tests

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestNoSystemctlService verifies the automator does NOT use systemctl, service, or init.d.
func TestNoSystemctlService(t *testing.T) {
	repoPath := GetRepoPath()
	forbidden := []string{"systemctl", "init.d", "\"service\""}
	var found []string
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
		content := string(data)
		for _, sub := range forbidden {
			if strings.Contains(content, sub) {
				found = append(found, path+": contains "+sub)
			}
		}
		return nil
	})
	if err != nil {
		RecordResult("TestNoSystemctlService", false, err.Error())
		t.Fatal(err)
	}
	if len(found) > 0 {
		msg := strings.Join(found, "; ")
		RecordResult("TestNoSystemctlService", false, msg)
		t.Fatalf("source must not use systemctl, service, or init.d: %s", msg)
	}
	RecordResult("TestNoSystemctlService", true, "")
}
