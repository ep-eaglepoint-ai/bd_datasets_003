package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

// TestFileInLiveNotStaging verifies that after a successful run, the processed .conf exists only in live, not in staging.
func TestFileInLiveNotStaging(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("automator integration test runs in Docker/Linux")
	}
	repoPath := GetRepoPath()
	staging := t.TempDir()
	live := t.TempDir()
	reject := t.TempDir()

	fakeDir := filepath.Join(t.TempDir(), "fake_apache")
	_ = os.MkdirAll(fakeDir, 0755)
	_ = os.WriteFile(filepath.Join(fakeDir, "main.go"), []byte(`package main; import "os"; func main() { os.Exit(0) }`), 0644)
	_ = os.WriteFile(filepath.Join(fakeDir, "go.mod"), []byte("module fake\ngo 1.21\n"), 0644)
	fakeApache := filepath.Join(t.TempDir(), "apache_fake")
	buildFake := exec.Command("go", "build", "-o", fakeApache, ".")
	buildFake.Dir = fakeDir
	if out, err := buildFake.CombinedOutput(); err != nil {
		RecordResult("TestFileInLiveNotStaging", false, string(out))
		t.Fatalf("build fake: %v\n%s", err, out)
	}

	pidFile := filepath.Join(t.TempDir(), "httpd.pid")
	_ = os.WriteFile(pidFile, []byte("999999"), 0644)

	_ = os.WriteFile(filepath.Join(staging, "vhost.conf"), []byte("config"), 0644)

	// Build to temp dir so binary has execute permission (volume mount may not preserve +x)
	automatorBin := filepath.Join(t.TempDir(), "automator_bin")
	buildCmd := exec.Command("go", "build", "-o", automatorBin, ".")
	buildCmd.Dir = repoPath
	if out, err := buildCmd.CombinedOutput(); err != nil {
		RecordResult("TestFileInLiveNotStaging", false, string(out))
		t.Fatalf("build automator: %v\n%s", err, out)
	}

	cmd := exec.Command(automatorBin,
		"-staging", staging, "-live", live, "-reject", reject,
		"-pidfile", pidFile, "-interval", "200ms", "-apache", fakeApache,
	)
	cmd.Dir = repoPath
	if err := cmd.Start(); err != nil {
		RecordResult("TestFileInLiveNotStaging", false, err.Error())
		t.Fatal(err)
	}
	time.Sleep(1 * time.Second)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	liveConf := filepath.Join(live, "vhost.conf")
	stagingConf := filepath.Join(staging, "vhost.conf")
	if _, err := os.Stat(liveConf); err != nil {
		RecordResult("TestFileInLiveNotStaging", false, "vhost.conf not in live")
		t.Fatal("vhost.conf should be in live after successful run")
	}
	if _, err := os.Stat(stagingConf); err == nil {
		RecordResult("TestFileInLiveNotStaging", false, "vhost.conf must not remain in staging")
		t.Fatal("vhost.conf must not remain in staging")
	}
	RecordResult("TestFileInLiveNotStaging", true, "")
}
