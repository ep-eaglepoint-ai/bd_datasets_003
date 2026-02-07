package tests

import (
	"errors"
	"testing"

	upload "upload-protocol"
)

// Req(4): Must simulate a crash/interruption loop.
func TestReq04_SimulatedCrashAfterThreshold(t *testing.T) {
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

	local := newTempFilePath(t, "ten.bin")
	writeRandomFile(t, local, 10<<20)

	err = c.UploadResumable(id, local, 5<<20)
	if !errors.Is(err, upload.ErrSimulatedCrash) {
		t.Fatalf("expected ErrSimulatedCrash, got %v", err)
	}
}
