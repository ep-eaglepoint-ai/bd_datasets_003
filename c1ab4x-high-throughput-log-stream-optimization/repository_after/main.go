package main

import (
	"bufio"
	"bytes"
	"io"
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
// OPTIMIZED:
// 1. Uses bufio.Scanner for streaming line-by-line processing (O(1) memory).
// 2. Uses manual byte-slice manipulation instead of json.Unmarshal.
// 3. Uses bufio.Writer for buffered output to reduce syscalls.
func ProcessLogStream(r io.Reader, w io.Writer) error {
	scanner := bufio.NewScanner(r)
	// Handle lines longer than default 64KB buffer
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 10*1024*1024) // Max 10MB per line

	bw := bufio.NewWriter(w)
	defer bw.Flush()

	// Pre-allocate byte slices for field keys (avoid allocations in loop)
	levelKey := []byte(`"level"`)
	msgKey := []byte(`"msg"`)
	errorLevel := []byte(`"ERROR"`)

	for scanner.Scan() {
		line := scanner.Bytes()

		// Skip empty lines
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}

		// Extract level field using zero-allocation byte manipulation
		level := extractJSONField(line, levelKey)
		if level == nil {
			continue // Skip malformed lines
		}

		// Only process ERROR logs
		if !bytes.Equal(level, errorLevel) {
			continue
		}

		// Extract msg field
		msg := extractJSONField(line, msgKey)
		if msg == nil {
			continue
		}

		// Write output: [LEVEL] MSG\n
		bw.WriteByte('[')
		bw.Write(bytes.Trim(level, `"`))
		bw.WriteString("] ")
		bw.Write(bytes.Trim(msg, `"`))
		bw.WriteByte('\n')
	}

	return scanner.Err()
}

// extractJSONField extracts the value of a JSON field from a line using byte manipulation.
// Returns the raw value including quotes for strings.
// This avoids json.Unmarshal overhead.
func extractJSONField(line []byte, key []byte) []byte {
	idx := bytes.Index(line, key)
	if idx == -1 {
		return nil
	}

	// Find the colon after the key
	start := idx + len(key)
	for start < len(line) && (line[start] == ' ' || line[start] == ':') {
		start++
	}

	if start >= len(line) {
		return nil
	}

	// Handle string values (starts with ")
	if line[start] == '"' {
		end := start + 1
		for end < len(line) {
			if line[end] == '\\' && end+1 < len(line) {
				end += 2 // Skip escaped character
				continue
			}
			if line[end] == '"' {
				return line[start : end+1]
			}
			end++
		}
		return nil
	}

	// Handle non-string values (number, bool, null)
	end := start
	for end < len(line) && line[end] != ',' && line[end] != '}' && line[end] != ' ' {
		end++
	}

	return line[start:end]
}