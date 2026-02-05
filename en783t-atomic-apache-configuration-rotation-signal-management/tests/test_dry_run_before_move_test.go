package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

// TestDryRunBeforeMove verifies that validation (dry-run) runs before move; failing configs go to reject.
func TestDryRunBeforeMove(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("validator script and automator run best in Docker/Linux")
	}
	repoPath := GetRepoPath()
	staging := t.TempDir()
	live := t.TempDir()
	reject := t.TempDir()

	// Fake apache: exit 0 if path contains "good", else exit 1
	fakeApache := filepath.Join(t.TempDir(), "apache_fake")
	mainGo := `package main
import ("os"; "strings")
func main() {
	for _, a := range os.Args {
		if strings.Contains(a, "good") { os.Exit(0) }
	}
	os.Exit(1)
}`
	fakeDir := filepath.Join(t.TempDir(), "fake_apache")
	_ = os.MkdirAll(fakeDir, 0755)
	if err := os.WriteFile(filepath.Join(fakeDir, "main.go"), []byte(mainGo), 0644); err != nil {
		RecordResult("TestDryRunBeforeMove", false, err.Error())
		t.Fatal(err)
	}
	mod := "module fake\ngo 1.21\n"
	_ = os.WriteFile(filepath.Join(fakeDir, "go.mod"), []byte(mod), 0644)
	build := exec.Command("go", "build", "-o", fakeApache, ".")
	build.Dir = fakeDir
	if out, err := build.CombinedOutput(); err != nil {
		RecordResult("TestDryRunBeforeMove", false, string(out))
		t.Fatalf("build fake apache: %v\n%s", err, out)
	}

	goodConf := filepath.Join(staging, "good.conf")
	badConf := filepath.Join(staging, "bad.conf")
	_ = os.WriteFile(goodConf, []byte("good config"), 0644)
	_ = os.WriteFile(badConf, []byte("bad config"), 0644)

	pidFile := filepath.Join(t.TempDir(), "httpd.pid")
	_ = os.WriteFile(pidFile, []byte("999999"), 0644)

	automatorBin := filepath.Join(t.TempDir(), "automator_bin")
	buildAutomator := exec.Command("go", "build", "-o", automatorBin, ".")
	buildAutomator.Dir = repoPath
	if out, err := buildAutomator.CombinedOutput(); err != nil {
		RecordResult("TestDryRunBeforeMove", false, string(out))
		t.Fatalf("build automator: %v\n%s", err, out)
	}

	cmd := exec.Command(automatorBin,
		"-staging", staging,
		"-live", live,
		"-reject", reject,
		"-pidfile", pidFile,
		"-interval", "200ms",
		"-apache", fakeApache,
	)
	cmd.Dir = repoPath
	if err := cmd.Start(); err != nil {
		RecordResult("TestDryRunBeforeMove", false, err.Error())
		t.Fatal(err)
	}
	time.Sleep(1 * time.Second)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	_, errGoodLive := os.Stat(filepath.Join(live, "good.conf"))
	_, errBadReject := os.Stat(filepath.Join(reject, "bad.conf"))
	_, errBadLive := os.Stat(filepath.Join(live, "bad.conf"))
	_, errGoodStaging := os.Stat(filepath.Join(staging, "good.conf"))

	if errGoodLive != nil {
		RecordResult("TestDryRunBeforeMove", false, "good.conf not in live")
		t.Fatal("good.conf should be in live")
	}
	if errBadReject != nil {
		RecordResult("TestDryRunBeforeMove", false, "bad.conf not in reject")
		t.Fatal("bad.conf should be in reject")
	}
	if errBadLive == nil {
		RecordResult("TestDryRunBeforeMove", false, "bad.conf must not be in live")
		t.Fatal("bad.conf must not be in live")
	}
	if errGoodStaging == nil {
		RecordResult("TestDryRunBeforeMove", false, "good.conf should not remain in staging")
		t.Fatal("good.conf should not remain in staging")
	}
	RecordResult("TestDryRunBeforeMove", true, "")
}
