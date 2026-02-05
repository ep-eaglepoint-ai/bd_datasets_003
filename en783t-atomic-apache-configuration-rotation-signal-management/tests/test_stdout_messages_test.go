package tests

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// TestStdoutStatusMessages verifies clear status messages: valid config applied, syntax failed/moved to rejected, reload signal sent, stale PID.
func TestStdoutStatusMessages(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("automator integration test runs in Docker/Linux")
	}
	repoPath := GetRepoPath()
	staging := t.TempDir()
	live := t.TempDir()
	reject := t.TempDir()
	pidFile := filepath.Join(t.TempDir(), "httpd.pid")
	_ = os.WriteFile(pidFile, []byte("999999"), 0644)

	// Fake apache: succeed for path containing "good", fail otherwise
	fakeDir := filepath.Join(t.TempDir(), "fake_apache")
	_ = os.MkdirAll(fakeDir, 0755)
	_ = os.WriteFile(filepath.Join(fakeDir, "main.go"), []byte(`package main
import ("os"; "strings")
func main() {
	for _, a := range os.Args {
		if strings.Contains(a, "good") { os.Exit(0) }
	}
	os.Exit(1)
}`), 0644)
	_ = os.WriteFile(filepath.Join(fakeDir, "go.mod"), []byte("module fake\ngo 1.21\n"), 0644)
	fakeApache := filepath.Join(t.TempDir(), "apache_fake")
	buildFake := exec.Command("go", "build", "-o", fakeApache, ".")
	buildFake.Dir = fakeDir
	if out, err := buildFake.CombinedOutput(); err != nil {
		RecordResult("TestStdoutStatusMessages", false, string(out))
		t.Fatalf("build fake: %v\n%s", err, out)
	}

	_ = os.WriteFile(filepath.Join(staging, "good.conf"), []byte("good"), 0644)
	_ = os.WriteFile(filepath.Join(staging, "bad.conf"), []byte("bad"), 0644)

	// Build to temp dir so binary has execute permission (volume mount may not preserve +x)
	automatorBin := filepath.Join(t.TempDir(), "automator_bin")
	buildCmd := exec.Command("go", "build", "-o", automatorBin, ".")
	buildCmd.Dir = repoPath
	if out, err := buildCmd.CombinedOutput(); err != nil {
		RecordResult("TestStdoutStatusMessages", false, string(out))
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
		RecordResult("TestStdoutStatusMessages", false, err.Error())
		t.Fatal(err)
	}
	time.Sleep(1 * time.Second)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	outStr := outBuf.String()

	// We expect: Valid config applied (for good.conf), Syntax check failed / moved to rejected (for bad.conf), and either Reload signal sent or stale (PID 999999)
	hasValid := strings.Contains(outStr, "Valid config applied")
	hasReject := strings.Contains(outStr, "Syntax check failed") || strings.Contains(outStr, "moved to rejected")
	hasReloadOrStale := strings.Contains(outStr, "Reload signal sent") || strings.Contains(outStr, "stale") || strings.Contains(outStr, "not running")

	if !hasValid {
		RecordResult("TestStdoutStatusMessages", false, "stdout should contain 'Valid config applied'")
		t.Fatal("stdout should contain 'Valid config applied'")
	}
	if !hasReject {
		RecordResult("TestStdoutStatusMessages", false, "stdout should contain syntax failed or moved to rejected")
		t.Fatal("stdout should contain syntax failed or moved to rejected")
	}
	if !hasReloadOrStale {
		RecordResult("TestStdoutStatusMessages", false, "stdout should contain Reload signal sent or stale/not running")
		t.Fatal("stdout should contain Reload signal sent or stale/not running")
	}
	RecordResult("TestStdoutStatusMessages", true, "")
}
