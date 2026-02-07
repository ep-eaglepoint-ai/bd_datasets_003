package tests

import (
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func writeRandomFile(t *testing.T, path string, size int64) {
	t.Helper()

	f, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer f.Close()

	buf := make([]byte, 1<<20)
	var off int64

	for off < size {
		toWrite := int64(len(buf))
		if size-off < toWrite {
			toWrite = size - off
		}
		if _, err := rand.Read(buf[:toWrite]); err != nil {
			t.Fatalf("rand: %v", err)
		}
		if _, err := f.Write(buf[:toWrite]); err != nil {
			t.Fatalf("write: %v", err)
		}
		off += toWrite
	}
	if err := f.Sync(); err != nil {
		t.Fatalf("sync: %v", err)
	}
}

func readAllFile(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("readfile: %v", err)
	}
	return b
}

func serverFilePath(storageDir, id string) string {
	return filepath.Join(storageDir, id+".bin")
}

func newTempFilePath(t *testing.T, name string) string {
	t.Helper()
	return filepath.Join(t.TempDir(), name)
}

func newTestServer(t *testing.T, srv interface{ Handler() http.Handler }) *httptest.Server {
	t.Helper()
	return httptest.NewServer(srv.Handler())
}

func newTestServerWithHandler(t *testing.T, handler http.Handler) *httptest.Server {
	t.Helper()
	return httptest.NewServer(handler)
}

func fileStat(path string) (int64, error) {
	st, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return st.Size(), nil
}
