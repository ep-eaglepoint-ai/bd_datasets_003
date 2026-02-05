package main

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// LogEntry represents the structure of the incoming JSON log
type LogEntry struct {
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Msg       string `json:"msg"`
	Service   string `json:"service"`
	RequestID string `json:"request_id"`
}

// ProcessLogStream reads JSON logs from r, filters for "ERROR" level,
// and writes a formatted string "[LEVEL] MSG\n" to w.
//
// OPTIMIZATION TARGET:
// 1. Currently loads everything into memory (Crash on large files).
// 2. Uses too much GC (string splits, full JSON parsing).
// 3. Writes unbuffered (too many syscalls).
func ProcessLogStream(r io.Reader, w io.Writer) error {
	// BAD: Reading the entire stream into memory
	data, err := io.ReadAll(r)
	if err != nil {
		return err
	}

	// BAD: Huge allocation for string conversion and splitting
	lines := strings.Split(string(data), "\n")

	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}

		// BAD: recursive allocation parsing JSON
		var entry LogEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			// Skip malformed lines
			continue
		}

		// Logic: Only keep ERROR logs
		if entry.Level == "ERROR" {
			// BAD: Unbuffered small write (high syscall overhead)
			fmt.Fprintf(w, "[%s] %s\n", entry.Level, entry.Msg)
		}
	}

	return nil
}