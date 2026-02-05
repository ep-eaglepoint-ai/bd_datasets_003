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

// TestPidReadFromFile verifies that the automator reads Apache PID from the pid file (parse string to int).
func TestPidReadFromFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("SIGHUP and PID signaling tested in Docker/Linux")
	}
	repoPath := GetRepoPath()
	staging := t.TempDir()
	live := t.TempDir()
	reject := t.TempDir()
	pidFile := filepath.Join(t.TempDir(), "httpd.pid")
	_ = os.WriteFile(pidFile, []byte("999999"), 0644)

	fakeDir := filepath.Join(t.TempDir(), "fake_apache")
	_ = os.MkdirAll(fakeDir, 0755)
	_ = os.WriteFile(filepath.Join(fakeDir, "main.go"), []byte(`package main
import ("os"; "strings")
func main() {
	for _, a := range os.Args {
		if strings.Contains(a, ".conf") { os.Exit(0) }
	}
	os.Exit(1)
}`), 0644)
	_ = os.WriteFile(filepath.Join(fakeDir, "go.mod"), []byte("module fake\ngo 1.21\n"), 0644)
	fakeApache := filepath.Join(t.TempDir(), "apache_fake")
	build := exec.Command("go", "build", "-o", fakeApache, ".")
	build.Dir = fakeDir
	if out, err := build.CombinedOutput(); err != nil {
		RecordResult("TestPidReadFromFile", false, string(out))
		t.Fatalf("build fake apache: %v\n%s", err, out)
	}

	_ = os.WriteFile(filepath.Join(staging, "site.conf"), []byte("config"), 0644)

	// Build to temp dir so binary has execute permission (volume mount may not preserve +x)
	automatorBin := filepath.Join(t.TempDir(), "automator_bin")
	buildAutomator := exec.Command("go", "build", "-o", automatorBin, ".")
	buildAutomator.Dir = repoPath
	if out, err := buildAutomator.CombinedOutput(); err != nil {
		RecordResult("TestPidReadFromFile", false, string(out))
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
		RecordResult("TestPidReadFromFile", false, err.Error())
		t.Fatal(err)
	}
	time.Sleep(1 * time.Second)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()
	outStr := outBuf.String()
	if !strings.Contains(outStr, "Reload signal sent") && !strings.Contains(outStr, "stale") && !strings.Contains(outStr, "not running") {
		RecordResult("TestPidReadFromFile", false, "stdout should show reload or stale PID; got: "+outStr)
		t.Fatalf("expected reload or stale PID message in output; got: %s", outStr)
	}
	if !strings.Contains(outStr, "Valid config applied") {
		RecordResult("TestPidReadFromFile", false, "expected Valid config applied")
		t.Fatal("expected Valid config applied in output")
	}
	RecordResult("TestPidReadFromFile", true, "")
}
