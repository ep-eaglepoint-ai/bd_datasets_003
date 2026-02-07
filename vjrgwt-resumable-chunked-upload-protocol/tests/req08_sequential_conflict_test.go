package tests

import (
	"bytes"
	"errors"
	"testing"

	upload "upload-protocol"
)

// Req(8): Sequential Check: send chunk 1, then skip ahead; expect 409.
func TestReq08_SequentialConflict409(t *testing.T) {
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

	ch1 := bytes.Repeat([]byte{0xAA}, 100)
	if _, err := c.PatchAppend(id, 0, ch1); err != nil {
		t.Fatalf("patch ch1: %v", err)
	}

	ch3 := bytes.Repeat([]byte{0xBB}, 100)
	_, err = c.PatchAppend(id, 200, ch3)
	if err == nil {
		t.Fatalf("expected conflict error")
	}
	var ce *upload.ConflictError
	if !errors.As(err, &ce) {
		t.Fatalf("expected *ConflictError, got %T: %v", err, err)
	}
	if ce.ServerOffset != 100 {
		t.Fatalf("expected server offset 100, got %d", ce.ServerOffset)
	}
}
