package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

// TestSighupSentToProcess verifies that SIGHUP is sent to the process whose PID is in the pid file.
func TestSighupSentToProcess(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("SIGHUP subprocess test runs on Linux (Docker)")
	}
	repoPath := GetRepoPath()
	staging := t.TempDir()
	live := t.TempDir()
	reject := t.TempDir()
	pidFile := filepath.Join(t.TempDir(), "httpd.pid")
	doneFile := filepath.Join(t.TempDir(), "sighup_received")

	receiverDir := filepath.Join(t.TempDir(), "receiver")
	_ = os.MkdirAll(receiverDir, 0755)
	mainContent := []byte("package main\n\nimport (\n\t\"fmt\"\n\t\"os\"\n\t\"os/signal\"\n\t\"syscall\"\n)\n\nfunc main() {\n\tpidFile := os.Getenv(\"PID_FILE\")\n\tdoneFile := os.Getenv(\"DONE_FILE\")\n\tif pidFile == \"\" || doneFile == \"\" {\n\t\tos.Exit(2)\n\t}\n\t_ = os.WriteFile(pidFile, []byte(fmt.Sprint(os.Getpid())), 0644)\n\tch := make(chan os.Signal, 1)\n\tsignal.Notify(ch, syscall.SIGHUP)\n\t<-ch\n\t_ = os.WriteFile(doneFile, []byte(\"1\"), 0644)\n\tos.Exit(0)\n}\n")
	if err := os.WriteFile(filepath.Join(receiverDir, "main.go"), mainContent, 0644); err != nil {
		RecordResult("TestSighupSentToProcess", false, err.Error())
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(receiverDir, "go.mod"), []byte("module receiver\ngo 1.21\n"), 0644)
	receiverBin := filepath.Join(t.TempDir(), "receiver")
	buildReceiver := exec.Command("go", "build", "-o", receiverBin, ".")
	buildReceiver.Dir = receiverDir
	if out, err := buildReceiver.CombinedOutput(); err != nil {
		RecordResult("TestSighupSentToProcess", false, string(out))
		t.Fatalf("build receiver: %v\n%s", err, out)
	}

	receiverCmd := exec.Command(receiverBin)
	receiverCmd.Env = append(os.Environ(), "PID_FILE="+pidFile, "DONE_FILE="+doneFile)
	if err := receiverCmd.Start(); err != nil {
		RecordResult("TestSighupSentToProcess", false, err.Error())
		t.Fatal(err)
	}
	defer receiverCmd.Process.Kill()
	time.Sleep(200 * time.Millisecond)

	fakeDir := filepath.Join(t.TempDir(), "fake_apache")
	_ = os.MkdirAll(fakeDir, 0755)
	_ = os.WriteFile(filepath.Join(fakeDir, "main.go"), []byte("package main; import \"os\"; func main() { os.Exit(0) }"), 0644)
	_ = os.WriteFile(filepath.Join(fakeDir, "go.mod"), []byte("module fake\ngo 1.21\n"), 0644)
	fakeApache := filepath.Join(t.TempDir(), "apache_fake")
	buildFake := exec.Command("go", "build", "-o", fakeApache, ".")
	buildFake.Dir = fakeDir
	if out, err := buildFake.CombinedOutput(); err != nil {
		RecordResult("TestSighupSentToProcess", false, string(out))
		t.Fatalf("build fake: %v\n%s", err, out)
	}

	_ = os.WriteFile(filepath.Join(staging, "site.conf"), []byte("config"), 0644)
	automatorBin := filepath.Join(t.TempDir(), "automator_bin")
	buildAutomator := exec.Command("go", "build", "-o", automatorBin, ".")
	buildAutomator.Dir = repoPath
	if out, err := buildAutomator.CombinedOutput(); err != nil {
		RecordResult("TestSighupSentToProcess", false, string(out))
		t.Fatalf("build automator: %v\n%s", err, out)
	}

	cmd := exec.Command(automatorBin,
		"-staging", staging, "-live", live, "-reject", reject,
		"-pidfile", pidFile, "-interval", "200ms", "-apache", fakeApache,
	)
	cmd.Dir = repoPath
	if err := cmd.Start(); err != nil {
		RecordResult("TestSighupSentToProcess", false, err.Error())
		t.Fatal(err)
	}
	time.Sleep(1 * time.Second)
	_ = cmd.Process.Kill()
	_ = cmd.Wait()

	if _, err := os.Stat(doneFile); err != nil {
		RecordResult("TestSighupSentToProcess", false, "SIGHUP was not received by receiver process")
		t.Fatal("SIGHUP was not received by receiver process")
	}
	RecordResult("TestSighupSentToProcess", true, "")
}
