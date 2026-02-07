package tests

import (
	"net/http"
	"sync/atomic"
	"testing"

	upload "upload-protocol"
)

// Req(3): Must chunk the file (e.g., 1MB buffers).
func TestReq03_Chunking1MB(t *testing.T) {
	storage := t.TempDir()
	srv, err := upload.NewServer(storage)
	if err != nil {
		t.Fatalf("NewServer: %v", err)
	}

	var maxSeen int64
	var patchCount int64

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch && len(r.URL.Path) > 7 && r.URL.Path[:7] == "/files/" {
			atomic.AddInt64(&patchCount, 1)
			if r.ContentLength > atomic.LoadInt64(&maxSeen) {
				atomic.StoreInt64(&maxSeen, r.ContentLength)
			}
		}
		srv.Handler().ServeHTTP(w, r)
	})

	ts := newTestServerWithHandler(t, handler)
	defer ts.Close()

	c := upload.NewClient(ts.URL)
	c.ChunkSize = 1 << 20
	id, err := c.InitUpload()
	if err != nil {
		t.Fatalf("InitUpload: %v", err)
	}

	local := newTempFilePath(t, "five.bin")
	writeRandomFile(t, local, 5<<20)

	if err := c.UploadResumable(id, local, 0); err != nil {
		t.Fatalf("UploadResumable: %v", err)
	}

	if atomic.LoadInt64(&maxSeen) != 1<<20 {
		t.Fatalf("expected max chunk size 1MB, got %d", atomic.LoadInt64(&maxSeen))
	}
	if atomic.LoadInt64(&patchCount) != 5 {
		t.Fatalf("expected 5 PATCH requests, got %d", atomic.LoadInt64(&patchCount))
	}
}
