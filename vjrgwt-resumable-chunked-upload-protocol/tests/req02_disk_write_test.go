package tests

import (
	"bytes"
	"testing"

	upload "upload-protocol"
)

// Req(2): Server must write chunks to disk immediately.
func TestReq02_DiskWriteImmediate(t *testing.T) {
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

	data := []byte{9, 8, 7, 6}
	if _, err := c.PatchAppend(id, 0, data); err != nil {
		t.Fatalf("PatchAppend: %v", err)
	}

	p := serverFilePath(storage, id)
	b := readAllFile(t, p)
	if !bytes.Equal(b, data) {
		t.Fatalf("disk content mismatch: %v", b)
	}
}
