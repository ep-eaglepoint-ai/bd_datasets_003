package main

import "os"

// MoveToLive atomically moves a file from staging to live using os.Rename.
// On POSIX this guarantees no partial reads.
func MoveToLive(stagingPath, livePath string) error {
	return os.Rename(stagingPath, livePath)
}

// MoveToRejected moves a file from staging to the rejected directory.
func MoveToRejected(stagingPath, rejectPath string) error {
	return os.Rename(stagingPath, rejectPath)
}
