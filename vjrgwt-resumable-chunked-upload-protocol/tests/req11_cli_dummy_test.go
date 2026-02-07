package tests

import (
	"errors"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	upload "upload-protocol"
)

func TestReq11_DummyFileAndRandomCrash(t *testing.T) {
	storage := t.TempDir()
	srv, err := upload.NewServer(storage)
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	ts := newTestServer(t, srv)
	defer ts.Close()

	c := upload.NewClient(ts.URL)
	id, err := c.InitUpload()
	if err != nil {
		t.Fatalf("InitUpload: %v", err)
	}

	local := newTempFilePath(t, "dummy.bin")
	if err := upload.GenerateDummyFile(local, 8<<20); err != nil {
		t.Fatalf("GenerateDummyFile: %v", err)
	}

	rng := rand.New(rand.NewSource(1))
	threshold := upload.RandomCrashAfter(8<<20, rng)
	if threshold < 4<<20 || threshold > 8<<20 {
		t.Fatalf("crash threshold out of range: %d", threshold)
	}

	rng = rand.New(rand.NewSource(1))
	err = c.UploadResumableRandomCrash(id, local, rng)
	if !errors.Is(err, upload.ErrSimulatedCrash) {
		t.Fatalf("expected ErrSimulatedCrash, got %v", err)
	}
}

func TestReq12_CLIUploaderBuilds(t *testing.T) {
	repoPath := os.Getenv("REPO_PATH")
	if repoPath == "" {
		t.Skip("REPO_PATH not set")
	}
	if filepath.Base(repoPath) != "repository_after" {
		repoPath = filepath.Join(repoPath, "repository_after")
	}
	cmdPath := filepath.Join(repoPath, "cmd", "uploader")
	cmd := exec.Command("go", "build", ".")
	cmd.Dir = cmdPath
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("go build ./cmd/uploader: %v: %s", err, string(out))
	}
}
