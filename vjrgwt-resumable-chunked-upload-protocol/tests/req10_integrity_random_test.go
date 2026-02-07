package tests

import (
	"testing"

	upload "upload-protocol"
)

// Req(10): Integrity Check: upload random bytes; verify checksums match.
func TestReq10_IntegrityRandomBytesMD5(t *testing.T) {
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

	local := newTempFilePath(t, "rand.bin")
	writeRandomFile(t, local, 6<<20+12345)

	if err := c.UploadResumable(id, local, 0); err != nil {
		t.Fatalf("upload: %v", err)
	}

	localMD5, localN, err := upload.MD5File(local)
	if err != nil {
		t.Fatalf("local md5: %v", err)
	}
	serverMD5, serverN, err := upload.MD5File(serverFilePath(storage, id))
	if err != nil {
		t.Fatalf("server md5: %v", err)
	}

	if localN != serverN {
		t.Fatalf("size mismatch: local=%d server=%d", localN, serverN)
	}
	if localMD5 != serverMD5 {
		t.Fatalf("md5 mismatch: local=%s server=%s", localMD5, serverMD5)
	}
}
