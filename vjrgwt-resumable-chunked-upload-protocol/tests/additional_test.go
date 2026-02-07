package tests

import (
	"bytes"
	"io"
	"net/http"
	"strconv"
	"testing"

	upload "upload-protocol"
)

// Additional sanity coverage: protocol headers and conflict response details.
func TestAdditional_ProtocolHeaders(t *testing.T) {
	storage := t.TempDir()
	srv, err := upload.NewServer(storage)
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}
	ts := newTestServer(t, srv)
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/files", "text/plain", nil)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %s", resp.Status)
	}
	id := resp.Header.Get(upload.HeaderFileID)
	if id == "" {
		t.Fatalf("missing File-ID header")
	}

	req, _ := http.NewRequest(http.MethodHead, ts.URL+"/files/"+id, nil)
	hresp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("head: %v", err)
	}
	hresp.Body.Close()
	if hresp.Header.Get(upload.HeaderUploadOffset) != "0" {
		t.Fatalf("expected Upload-Offset 0, got %q", hresp.Header.Get(upload.HeaderUploadOffset))
	}

	preq, _ := http.NewRequest(http.MethodPatch, ts.URL+"/files/"+id, io.NopCloser(bytes.NewReader([]byte("x"))))
	preq.ContentLength = 1
	preq.Header.Set(upload.HeaderUploadOffset, strconv.FormatInt(10, 10))
	presp, err := http.DefaultClient.Do(preq)
	if err != nil {
		t.Fatalf("patch: %v", err)
	}
	presp.Body.Close()
	if presp.StatusCode != http.StatusConflict {
		t.Fatalf("expected 409, got %s", presp.Status)
	}
	if presp.Header.Get(upload.HeaderUploadOffset) != "0" {
		t.Fatalf("expected Upload-Offset 0 on conflict, got %q", presp.Header.Get(upload.HeaderUploadOffset))
	}
}
