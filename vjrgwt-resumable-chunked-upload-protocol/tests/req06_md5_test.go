package tests

import (
	"testing"

	upload "upload-protocol"
)

// Req(6): Final uploaded file on server must have same MD5 as source.
func TestReq06_FinalMD5Matches(t *testing.T) {
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

	local := newTempFilePath(t, "source.bin")
	writeRandomFile(t, local, 3<<20+321)

	if err := c.UploadResumable(id, local, 0); err != nil {
		t.Fatalf("upload: %v", err)
	}

	localMD5, _, err := upload.MD5File(local)
	if err != nil {
		t.Fatalf("local md5: %v", err)
	}
	serverMD5, _, err := upload.MD5File(serverFilePath(storage, id))
	if err != nil {
		t.Fatalf("server md5: %v", err)
	}
	if localMD5 != serverMD5 {
		t.Fatalf("md5 mismatch: local=%s server=%s", localMD5, serverMD5)
	}
}
