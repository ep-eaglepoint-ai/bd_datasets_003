package tests

import (
	"bytes"
	"io"
	"net/http"
	"testing"

	upload "upload-protocol"
)

// Req(7): Server must not load the whole file into RAM; stream request bodies.
func TestReq07_StreamedPatchBodyWithoutContentLength(t *testing.T) {
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

	chunk := bytes.Repeat([]byte{0xAB}, 1<<20)
	pr, pw := io.Pipe()
	go func() {
		_, _ = pw.Write(chunk)
		_ = pw.Close()
	}()

	req, err := http.NewRequest(http.MethodPatch, ts.URL+"/files/"+id, pr)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	// No Content-Length set; use streaming path.
	req.Header.Set(upload.HeaderUploadOffset, "0")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 204, got %s: %s", resp.Status, string(bytes.TrimSpace(b)))
	}

	st, err := fileStat(serverFilePath(storage, id))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if st != int64(len(chunk)) {
		t.Fatalf("expected size %d, got %d", len(chunk), st)
	}
}
