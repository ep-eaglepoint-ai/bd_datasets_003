package tests

import (
	"errors"
	"os"
	"testing"

	upload "upload-protocol"
)

// Req(9): Resume Check: Upload 5MB, truncate to 4MB, resume from server truth.
func TestReq09_TruncateThenResumeFromServerTruth(t *testing.T) {
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
		t.Fatalf("expected crash at 5MB, got %v", err)
	}

	off, err := c.HeadOffset(id)
	if err != nil {
		t.Fatalf("HeadOffset: %v", err)
	}
	if off != 5<<20 {
		t.Fatalf("expected server offset 5MB, got %d", off)
	}

	if err := os.Truncate(serverFilePath(storage, id), 4<<20); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	off2, err := c.HeadOffset(id)
	if err != nil {
		t.Fatalf("HeadOffset: %v", err)
	}
	if off2 != 4<<20 {
		t.Fatalf("expected server offset 4MB after truncate, got %d", off2)
	}

	if err := c.UploadResumable(id, local, 0); err != nil {
		t.Fatalf("resume: %v", err)
	}

	localMD5, _, err := upload.MD5File(local)
	if err != nil {
		t.Fatalf("local md5: %v", err)
	}
	serverMD5, _, err := upload.MD5File(serverFilePath(storage, id))
	if err != nil {
		t.Fatalf("server md5: %v", err)
	}
	if serverMD5 != localMD5 {
		t.Fatalf("md5 mismatch: local=%s server=%s", localMD5, serverMD5)
	}
}
