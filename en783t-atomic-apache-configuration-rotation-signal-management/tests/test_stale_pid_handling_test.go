package tests

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestStalePidHandling verifies that a stale PID file does not crash the daemon; error is handled (logged).
func TestStalePidHandling(t *testing.T) {
	repoPath := GetRepoPath()
	staging := t.TempDir()
	live := t.TempDir()
	reject := t.TempDir()
	pidFile := filepath.Join(t.TempDir(), "httpd.pid")
	_ = os.WriteFile(pidFile, []byte("999999"), 0644)

	fakeDir := filepath.Join(t.TempDir(), "fake_apache")
	_ = os.MkdirAll(fakeDir, 0755)
	_ = os.WriteFile(filepath.Join(fakeDir, "main.go"), []byte(`package main; import "os"; func main() { os.Exit(0) }`), 0644)
	_ = os.WriteFile(filepath.Join(fakeDir, "go.mod"), []byte("module fake\ngo 1.21\n"), 0644)
	fakeApache := filepath.Join(t.TempDir(), "apache_fake")
	buildFake := exec.Command("go", "build", "-o", fakeApache, ".")
	buildFake.Dir = fakeDir
	if out, err := buildFake.CombinedOutput(); err != nil {
		RecordResult("TestStalePidHandling", false, string(out))
		t.Fatalf("build fake: %v\n%s", err, out)
	}

	_ = os.WriteFile(filepath.Join(staging, "site.conf"), []byte("config"), 0644)

	// Build to temp dir so binary has execute permission (volume mount may not preserve +x)
	automatorBin := filepath.Join(t.TempDir(), "automator_bin")
	buildCmd := exec.Command("go", "build", "-o", automatorBin, ".")
	buildCmd.Dir = repoPath
	if out, err := buildCmd.CombinedOutput(); err != nil {
		RecordResult("TestStalePidHandling", false, string(out))
		t.Fatalf("build automator: %v\n%s", err, out)
	}

	cmd := exec.Command(automatorBin,
		"-staging", staging, "-live", live, "-reject", reject,
		"-pidfile", pidFile, "-interval", "200ms", "-apache", fakeApache,
	)
	cmd.Dir = repoPath
	var outBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &outBuf
	if err := cmd.Start(); err != nil {
		RecordResult("TestStalePidHandling", false, err.Error())
		t.Fatal(err)
	}
	time.Sleep(1 * time.Second)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	outStr := outBuf.String()
	if !strings.Contains(outStr, "stale") && !strings.Contains(outStr, "not running") {
		RecordResult("TestStalePidHandling", false, "expected stale/not running message: "+outStr)
		t.Fatalf("expected stale PID or not running message in output; got: %s", outStr)
	}
	RecordResult("TestStalePidHandling", true, "")
}
