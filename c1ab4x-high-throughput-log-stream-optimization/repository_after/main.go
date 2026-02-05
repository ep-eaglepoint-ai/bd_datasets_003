package main

import (
	"bufio"
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
// 2. Uses structure-aware JSON parsing without json.Unmarshal.
// 3. Uses bufio.Writer for buffered output to reduce syscalls.
// 4. Zero allocations in hot path - reuses buffers.
// 5. Correctly decodes JSON escape sequences.
func ProcessLogStream(r io.Reader, w io.Writer) error {
	scanner := bufio.NewScanner(r)
	// Handle lines longer than default 64KB buffer
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 10*1024*1024) // Max 10MB per line

	bw := bufio.NewWriter(w)
	defer bw.Flush()

	// Pre-allocated buffers for decoded strings (reused each iteration)
	levelBuf := make([]byte, 0, 64)
	msgBuf := make([]byte, 0, 4096)

	for scanner.Scan() {
		line := scanner.Bytes()

		// Skip empty/whitespace lines without allocation
		if isEmptyLine(line) {
			continue
		}

		// Reset buffers (no allocation - just set length to 0)
		levelBuf = levelBuf[:0]
		msgBuf = msgBuf[:0]

		// Extract fields using structure-aware parsing
		levelBuf, msgBuf = extractFields(line, levelBuf, msgBuf)

		// Skip if level not found or not ERROR
		if len(levelBuf) != 5 ||
			levelBuf[0] != 'E' || levelBuf[1] != 'R' || levelBuf[2] != 'R' ||
			levelBuf[3] != 'O' || levelBuf[4] != 'R' {
			continue
		}

		// Skip if msg not found
		if msgBuf == nil {
			continue
		}

		// Write output: [LEVEL] MSG\n
		bw.WriteByte('[')
		bw.Write(levelBuf)
		bw.WriteString("] ")
		bw.Write(msgBuf)
		bw.WriteByte('\n')
	}

	return scanner.Err()
}

// isEmptyLine checks if line is empty or whitespace only without allocation
func isEmptyLine(line []byte) bool {
	for _, b := range line {
		if b != ' ' && b != '\t' && b != '\r' && b != '\n' {
			return false
		}
	}
	return true
}

// extractFields parses JSON structure-aware and extracts level and msg fields.
// Returns decoded values in the provided buffers.
// Uses a state machine to correctly handle:
// - Nested objects/strings
// - Keys appearing inside string values
// - Escaped characters
func extractFields(line []byte, levelBuf, msgBuf []byte) ([]byte, []byte) {
	n := len(line)
	i := 0

	// Skip leading whitespace and find opening brace
	for i < n && (line[i] == ' ' || line[i] == '\t') {
		i++
	}
	if i >= n || line[i] != '{' {
		return nil, nil
	}
	i++

	var foundLevel, foundMsg bool

	// Parse object fields
	for i < n && !foundLevel || !foundMsg {
		// Skip whitespace
		for i < n && (line[i] == ' ' || line[i] == '\t' || line[i] == '\r' || line[i] == '\n') {
			i++
		}
		if i >= n {
			break
		}

		// Check for end of object or comma
		if line[i] == '}' {
			break
		}
		if line[i] == ',' {
			i++
			continue
		}

		// Expect key (must be string starting with ")
		if line[i] != '"' {
			// Invalid JSON, skip
			break
		}

		// Parse key
		keyStart := i + 1
		i++
		for i < n {
			if line[i] == '\\' && i+1 < n {
				i += 2
				continue
			}
			if line[i] == '"' {
				break
			}
			i++
		}
		if i >= n {
			break
		}
		keyEnd := i
		i++ // skip closing quote

		// Check if this is "level" or "msg"
		keyLen := keyEnd - keyStart
		isLevel := keyLen == 5 &&
			line[keyStart] == 'l' && line[keyStart+1] == 'e' &&
			line[keyStart+2] == 'v' && line[keyStart+3] == 'e' &&
			line[keyStart+4] == 'l'
		isMsg := keyLen == 3 &&
			line[keyStart] == 'm' && line[keyStart+1] == 's' &&
			line[keyStart+2] == 'g'

		// Skip whitespace and colon
		for i < n && (line[i] == ' ' || line[i] == '\t') {
			i++
		}
		if i >= n || line[i] != ':' {
			break
		}
		i++
		for i < n && (line[i] == ' ' || line[i] == '\t') {
			i++
		}
		if i >= n {
			break
		}

		// Parse value
		if line[i] == '"' {
			// String value
			valueStart := i + 1
			i++

			if isLevel || isMsg {
				// Decode string value into appropriate buffer
				var buf []byte
				if isLevel {
					buf = levelBuf
				} else {
					buf = msgBuf
				}
				buf, i = decodeJSONString(line, i, n, buf)
				if isLevel {
					levelBuf = buf
					foundLevel = true
				} else {
					msgBuf = buf
					foundMsg = true
				}
			} else {
				// Skip string value we don't care about
				for i < n {
					if line[i] == '\\' && i+1 < n {
						i += 2
						continue
					}
					if line[i] == '"' {
						i++
						break
					}
					i++
				}
			}
			_ = valueStart // suppress unused warning
		} else if line[i] == '{' {
			// Nested object - skip it
			i = skipJSONValue(line, i, n)
		} else if line[i] == '[' {
			// Array - skip it
			i = skipJSONValue(line, i, n)
		} else {
			// Number, bool, null - skip until comma or }
			for i < n && line[i] != ',' && line[i] != '}' {
				i++
			}
		}
	}

	return levelBuf, msgBuf
}

// decodeJSONString decodes a JSON string starting at position i (after opening quote)
// and appends decoded bytes to buf. Returns updated buf and position after closing quote.
func decodeJSONString(line []byte, i, n int, buf []byte) ([]byte, int) {
	for i < n {
		if line[i] == '"' {
			i++
			return buf, i
		}
		if line[i] == '\\' && i+1 < n {
			i++
			switch line[i] {
			case '"':
				buf = append(buf, '"')
			case '\\':
				buf = append(buf, '\\')
			case '/':
				buf = append(buf, '/')
			case 'b':
				buf = append(buf, '\b')
			case 'f':
				buf = append(buf, '\f')
			case 'n':
				buf = append(buf, '\n')
			case 'r':
				buf = append(buf, '\r')
			case 't':
				buf = append(buf, '\t')
			case 'u':
				// Unicode escape \uXXXX
				if i+4 < n {
					r := decodeHex4(line[i+1 : i+5])
					if r >= 0 {
						buf = appendRune(buf, rune(r))
						i += 4
					} else {
						// Invalid escape, keep as-is
						buf = append(buf, '\\', 'u')
					}
				} else {
					buf = append(buf, '\\', 'u')
				}
			default:
				// Unknown escape, keep the character
				buf = append(buf, line[i])
			}
			i++
		} else {
			buf = append(buf, line[i])
			i++
		}
	}
	return buf, i
}

// decodeHex4 decodes 4 hex digits to an int, returns -1 on error
func decodeHex4(b []byte) int {
	if len(b) < 4 {
		return -1
	}
	var r int
	for _, c := range b[:4] {
		r <<= 4
		switch {
		case c >= '0' && c <= '9':
			r |= int(c - '0')
		case c >= 'a' && c <= 'f':
			r |= int(c - 'a' + 10)
		case c >= 'A' && c <= 'F':
			r |= int(c - 'A' + 10)
		default:
			return -1
		}
	}
	return r
}

// appendRune appends a rune as UTF-8 bytes
func appendRune(buf []byte, r rune) []byte {
	if r < 0x80 {
		return append(buf, byte(r))
	}
	if r < 0x800 {
		return append(buf, byte(0xC0|(r>>6)), byte(0x80|(r&0x3F)))
	}
	if r < 0x10000 {
		return append(buf, byte(0xE0|(r>>12)), byte(0x80|(r>>6&0x3F)), byte(0x80|(r&0x3F)))
	}
	return append(buf, byte(0xF0|(r>>18)), byte(0x80|(r>>12&0x3F)), byte(0x80|(r>>6&0x3F)), byte(0x80|(r&0x3F)))
}

// skipJSONValue skips a JSON value (object, array, string, number, bool, null)
// starting at position i. Returns position after the value.
func skipJSONValue(line []byte, i, n int) int {
	if i >= n {
		return i
	}

	switch line[i] {
	case '"':
		// String
		i++
		for i < n {
			if line[i] == '\\' && i+1 < n {
				i += 2
				continue
			}
			if line[i] == '"' {
				return i + 1
			}
			i++
		}
		return i
	case '{':
		// Object
		depth := 1
		i++
		for i < n && depth > 0 {
			if line[i] == '"' {
				i = skipJSONValue(line, i, n)
				continue
			}
			if line[i] == '{' {
				depth++
			} else if line[i] == '}' {
				depth--
			}
			i++
		}
		return i
	case '[':
		// Array
		depth := 1
		i++
		for i < n && depth > 0 {
			if line[i] == '"' {
				i = skipJSONValue(line, i, n)
				continue
			}
			if line[i] == '[' {
				depth++
			} else if line[i] == ']' {
				depth--
			}
			i++
		}
		return i
	default:
		// Number, bool, null
		for i < n && line[i] != ',' && line[i] != '}' && line[i] != ']' {
			i++
		}
		return i
	}
}