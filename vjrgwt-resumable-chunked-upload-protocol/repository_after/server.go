// server.go
package upload

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

const (
	HeaderUploadOffset = "Upload-Offset"
	HeaderFileID       = "File-ID"
)

type Server struct {
	storageDir string
	mu         sync.Mutex // protects ID generation collision edge cases (paranoia)
	fileLocks  sync.Map   // map[fileID]*sync.Mutex
}

func NewServer(storageDir string) (*Server, error) {
	if err := os.MkdirAll(storageDir, 0o755); err != nil {
		return nil, err
	}
	return &Server{storageDir: storageDir}, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/files", s.handleFilesRoot)  // POST /files
	mux.HandleFunc("/files/", s.handleFilesByID) // HEAD/PATCH /files/{id}
	return mux
}

func (s *Server) handleFilesRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/files" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id, err := s.newID()
	if err != nil {
		http.Error(w, "id generation failed", http.StatusInternalServerError)
		return
	}

	path := s.filePath(id)
	// Create file immediately on disk.
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		http.Error(w, "failed to create file", http.StatusInternalServerError)
		return
	}
	_ = f.Close()

	w.Header().Set(HeaderFileID, id)
	w.WriteHeader(http.StatusCreated)
	_, _ = w.Write([]byte(id + "\n"))
}

func (s *Server) handleFilesByID(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(r.URL.Path, "/files/") {
		http.NotFound(w, r)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/files/")
	if id == "" || strings.Contains(id, "/") {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	path := s.filePath(id)

	switch r.Method {
	case http.MethodHead:
		size, err := fileSize(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, "stat failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set(HeaderUploadOffset, strconv.FormatInt(size, 10))
		w.WriteHeader(http.StatusNoContent)

	case http.MethodPatch:
		lock := s.fileLock(id)
		lock.Lock()
		defer lock.Unlock()

		clientOffStr := r.Header.Get(HeaderUploadOffset)
		if clientOffStr == "" {
			http.Error(w, "missing Upload-Offset", http.StatusBadRequest)
			return
		}
		clientOff, err := strconv.ParseInt(clientOffStr, 10, 64)
		if err != nil || clientOff < 0 {
			http.Error(w, "invalid Upload-Offset", http.StatusBadRequest)
			return
		}

		curSize, err := fileSize(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			http.Error(w, "stat failed", http.StatusInternalServerError)
			return
		}

		// Strict Sequential Consistency: only append at exact committed offset.
		if clientOff != curSize {
			w.Header().Set(HeaderUploadOffset, strconv.FormatInt(curSize, 10))
			http.Error(w, fmt.Sprintf("offset mismatch: server=%d client=%d", curSize, clientOff), http.StatusConflict)
			return
		}

		// Stream directly to disk (no ReadAll). Prefer CopyN when Content-Length is known.
		defer r.Body.Close()

		f, err := os.OpenFile(path, os.O_WRONLY, 0o644)
		if err != nil {
			http.Error(w, "open failed", http.StatusInternalServerError)
			return
		}
		defer f.Close()

		if _, err := f.Seek(curSize, io.SeekStart); err != nil {
			http.Error(w, "seek failed", http.StatusInternalServerError)
			return
		}

		var written int64
		if r.ContentLength >= 0 {
			written, err = io.CopyN(f, r.Body, r.ContentLength) // Req(7)
			if err != nil && !errors.Is(err, io.EOF) {
				http.Error(w, "copy failed", http.StatusBadRequest)
				return
			}
		} else {
			written, err = io.Copy(f, r.Body) // still streaming
			if err != nil {
				http.Error(w, "copy failed", http.StatusBadRequest)
				return
			}
		}

		// Immediate persistence to disk for each chunk.
		if err := f.Sync(); err != nil { // Req(2)
			http.Error(w, "sync failed", http.StatusInternalServerError)
			return
		}

		newSize := curSize + written
		w.Header().Set(HeaderUploadOffset, strconv.FormatInt(newSize, 10))
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) filePath(id string) string {
	return filepath.Join(s.storageDir, id+".bin")
}

func fileSize(path string) (int64, error) {
	st, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return st.Size(), nil
}

func (s *Server) newID() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (s *Server) fileLock(id string) *sync.Mutex {
	if v, ok := s.fileLocks.Load(id); ok {
		return v.(*sync.Mutex)
	}
	mu := &sync.Mutex{}
	actual, _ := s.fileLocks.LoadOrStore(id, mu)
	return actual.(*sync.Mutex)
}
