package tests

import (
	"errors"
	"net/http"
	"sync/atomic"
	"testing"

	upload "upload-protocol"
)

// Req(5): Upon resumption, Client must query HEAD to get server offset.
func TestReq05_ResumeUsesHEAD(t *testing.T) {
	storage := t.TempDir()
	srv, err := upload.NewServer(storage)
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}

	var headCount int64
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead && len(r.URL.Path) > 7 && r.URL.Path[:7] == "/files/" {
			atomic.AddInt64(&headCount, 1)
		}
		srv.Handler().ServeHTTP(w, r)
	})

	ts := newTestServerWithHandler(t, handler)
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

	if err := c.UploadResumable(id, local, 0); err != nil {
		t.Fatalf("resume upload: %v", err)
	}

	if atomic.LoadInt64(&headCount) < 2 {
		t.Fatalf("expected at least 2 HEAD calls, got %d", atomic.LoadInt64(&headCount))
	}
}
