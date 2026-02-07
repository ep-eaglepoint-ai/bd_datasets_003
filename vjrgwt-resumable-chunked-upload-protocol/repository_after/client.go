// client.go
package upload

import (
	"bytes"
	"crypto/md5"
	crand "crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	mrand "math/rand"
	"net/http"
	"os"
	"strconv"
	"time"
)

var ErrSimulatedCrash = errors.New("simulated crash")

type Client struct {
	BaseURL   string
	HTTP      *http.Client
	ChunkSize int // Req(3) default 1MB if unset
}

func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL:   baseURL,
		HTTP:      http.DefaultClient,
		ChunkSize: 1 << 20, // 1MB
	}
}

func (c *Client) InitUpload() (string, error) { // Req(1) POST
	req, err := http.NewRequest(http.MethodPost, c.BaseURL+"/files", nil)
	if err != nil {
		return "", err
	}
	resp, err := c.http().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("init failed: %s: %s", resp.Status, string(b))
	}
	id := resp.Header.Get(HeaderFileID)
	if id == "" {
		b, _ := io.ReadAll(resp.Body)
		id = string(bytes.TrimSpace(b))
	}
	if id == "" {
		return "", errors.New("missing File-ID")
	}
	return id, nil
}

func (c *Client) HeadOffset(fileID string) (int64, error) { // Req(1) HEAD
	req, err := http.NewRequest(http.MethodHead, c.BaseURL+"/files/"+fileID, nil)
	if err != nil {
		return 0, err
	}
	resp, err := c.http().Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		return 0, fmt.Errorf("head failed: %s", resp.Status)
	}
	offStr := resp.Header.Get(HeaderUploadOffset)
	if offStr == "" {
		return 0, errors.New("missing Upload-Offset")
	}
	off, err := strconv.ParseInt(offStr, 10, 64)
	if err != nil {
		return 0, err
	}
	return off, nil
}

type ConflictError struct {
	ServerOffset int64
	Body         string
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf("409 conflict: server_offset=%d body=%q", e.ServerOffset, e.Body)
}

func (c *Client) PatchAppend(fileID string, offset int64, chunk []byte) (int64, error) { // Req(1) PATCH
	req, err := http.NewRequest(http.MethodPatch, c.BaseURL+"/files/"+fileID, bytes.NewReader(chunk))
	if err != nil {
		return 0, err
	}
	req.Header.Set(HeaderUploadOffset, strconv.FormatInt(offset, 10))
	req.Header.Set("Content-Type", "application/offset+octet-stream")
	req.ContentLength = int64(len(chunk))

	resp, err := c.http().Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent {
		offStr := resp.Header.Get(HeaderUploadOffset)
		if offStr == "" {
			return 0, errors.New("missing Upload-Offset in PATCH response")
		}
		newOff, err := strconv.ParseInt(offStr, 10, 64)
		if err != nil {
			return 0, err
		}
		return newOff, nil
	}

	if resp.StatusCode == http.StatusConflict { // Req(8)
		b, _ := io.ReadAll(resp.Body)
		sOffStr := resp.Header.Get(HeaderUploadOffset)
		var sOff int64
		if sOffStr != "" {
			sOff, _ = strconv.ParseInt(sOffStr, 10, 64)
		}
		return 0, &ConflictError{ServerOffset: sOff, Body: string(bytes.TrimSpace(b))}
	}

	b, _ := io.ReadAll(resp.Body)
	return 0, fmt.Errorf("patch failed: %s: %s", resp.Status, string(b))
}

// UploadResumable uploads localPath to server fileID in strict sequential chunks.
// - Always "Query-Then-Write": HEAD to get truth, Seek to that offset, then PATCH. (Req(5))
// - crashAfterBytes: if >0, returns ErrSimulatedCrash once the client has *attempted* to upload >= crashAfterBytes total.
func (c *Client) UploadResumable(fileID, localPath string, crashAfterBytes int64) error { // Req(4)(5)
	f, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer f.Close()

	// Source of truth alignment.
	serverOff, err := c.HeadOffset(fileID) // Req(5)
	if err != nil {
		return err
	}
	if _, err := f.Seek(serverOff, io.SeekStart); err != nil { // Req(5)
		return err
	}

	chunkSize := c.ChunkSize
	if chunkSize <= 0 {
		chunkSize = 1 << 20
	}
	buf := make([]byte, chunkSize)

	offset := serverOff
	var attempted int64

	for {
		n, rerr := f.Read(buf)
		if n > 0 {
			// Attempt append at current offset.
			newOff, perr := c.PatchAppend(fileID, offset, buf[:n])
			if perr != nil {
				// On conflict: re-sync from server truth, Seek, and continue. (Req(5))
				var ce *ConflictError
				if errors.As(perr, &ce) {
					offset = ce.ServerOffset
					if _, err := f.Seek(offset, io.SeekStart); err != nil {
						return err
					}
					continue
				}
				return perr
			}
			offset = newOff

			attempted += int64(n)
			if crashAfterBytes > 0 && attempted >= crashAfterBytes {
				return ErrSimulatedCrash // Req(4)
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return rerr
		}
	}
	return nil
}

// UploadResumableRandomCrash uploads and simulates a random crash after >= 50% completion.
// Use a deterministic rng in tests; nil uses time-based randomness.
func (c *Client) UploadResumableRandomCrash(fileID, localPath string, rng *mrand.Rand) error {
	info, err := os.Stat(localPath)
	if err != nil {
		return err
	}
	crashAfter := RandomCrashAfter(info.Size(), rng)
	return c.UploadResumable(fileID, localPath, crashAfter)
}

// RandomCrashAfter returns a random crash threshold in [size/2, size].
func RandomCrashAfter(size int64, rng *mrand.Rand) int64 {
	if size <= 0 {
		return 0
	}
	if rng == nil {
		rng = mrand.New(mrand.NewSource(time.Now().UnixNano()))
	}
	half := size / 2
	span := size - half
	return half + rng.Int63n(span+1)
}

// GenerateDummyFile writes random bytes to path using 1MB buffers.
func GenerateDummyFile(path string, size int64) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()

	buf := make([]byte, 1<<20)
	var off int64
	for off < size {
		toWrite := int64(len(buf))
		if size-off < toWrite {
			toWrite = size - off
		}
		if _, err := crand.Read(buf[:toWrite]); err != nil {
			return err
		}
		if _, err := f.Write(buf[:toWrite]); err != nil {
			return err
		}
		off += toWrite
	}
	return f.Sync()
}

func MD5File(path string) (string, int64, error) { // Req(6)(10)
	f, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer f.Close()

	h := md5.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return "", 0, err
	}
	return hex.EncodeToString(h.Sum(nil)), n, nil
}

func (c *Client) http() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return http.DefaultClient
}
