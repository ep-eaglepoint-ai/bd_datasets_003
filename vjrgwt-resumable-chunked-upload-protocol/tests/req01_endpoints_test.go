package tests

import (
	"testing"

	upload "upload-protocol"
)

// Req(1): Must implement POST (Init), HEAD (Offset Query), PATCH (Append).
func TestReq01_EndpointsInitHeadPatch(t *testing.T) {
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

	off, err := c.HeadOffset(id)
	if err != nil {
		t.Fatalf("HeadOffset: %v", err)
	}
	if off != 0 {
		t.Fatalf("expected offset 0, got %d", off)
	}

	newOff, err := c.PatchAppend(id, 0, []byte{1, 2, 3})
	if err != nil {
		t.Fatalf("PatchAppend: %v", err)
	}
	if newOff != 3 {
		t.Fatalf("expected new offset 3, got %d", newOff)
	}
}
