package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	upload "upload-protocol"
)

func main() {
	var (
		baseURL   = flag.String("base-url", "http://localhost:8080", "upload server base URL")
		sizeMB    = flag.Int64("size-mb", 50, "dummy file size in MB")
		chunkSize = flag.Int("chunk-size", 1<<20, "upload chunk size in bytes")
		tmpDir    = flag.String("tmp-dir", os.TempDir(), "temporary directory for dummy file")
	)
	flag.Parse()

	if *sizeMB <= 0 {
		fmt.Fprintln(os.Stderr, "size-mb must be positive")
		os.Exit(2)
	}

	path := filepath.Join(*tmpDir, "dummy-upload.bin")
	sizeBytes := *sizeMB << 20
	if err := upload.GenerateDummyFile(path, sizeBytes); err != nil {
		fmt.Fprintf(os.Stderr, "generate dummy file: %v\n", err)
		os.Exit(1)
	}

	client := upload.NewClient(*baseURL)
	client.ChunkSize = *chunkSize

	id, err := client.InitUpload()
	if err != nil {
		fmt.Fprintf(os.Stderr, "init upload: %v\n", err)
		os.Exit(1)
	}

	if err := client.UploadResumableRandomCrash(id, path, nil); err != nil {
		if !errors.Is(err, upload.ErrSimulatedCrash) {
			fmt.Fprintf(os.Stderr, "upload failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "simulated crash; resuming")
	}

	if err := client.UploadResumable(id, path, 0); err != nil {
		fmt.Fprintf(os.Stderr, "resume failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("upload complete: %s (%d MB)\n", id, *sizeMB)
}
