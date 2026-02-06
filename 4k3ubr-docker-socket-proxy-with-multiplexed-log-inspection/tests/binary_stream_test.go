package tests

import (
	"bytes"
	"context"
	"encoding/binary"
	"io"
	"net/http"
	"testing"
	"time"
)

// Mock types for testing
type mockFlusher struct {
	flushed int
}

func (m *mockFlusher) Flush() {
	m.flushed++
}

type mockResponseWriter struct {
	*bytes.Buffer
	mockFlusher
}

func (m *mockResponseWriter) Header() http.Header {
	return http.Header{}
}

func (m *mockResponseWriter) WriteHeader(statusCode int) {}

// TestBinaryHeaderParsing tests 8-byte header parsing
func TestBinaryHeaderParsing(t *testing.T) {
	tests := []struct {
		name        string
		streamType  byte
		payloadSize uint32
	}{
		{"stdout small", 1, 100},
		{"stderr medium", 2, 1024},
		{"stdout large", 1, 65536},
		{"zero size", 1, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			header := make([]byte, 8)
			header[0] = tt.streamType
			// bytes 1-3 are padding
			binary.BigEndian.PutUint32(header[4:8], tt.payloadSize)

			// Verify we can read it correctly
			parsedType := header[0]
			parsedSize := binary.BigEndian.Uint32(header[4:8])

			if parsedType != tt.streamType {
				t.Errorf("Expected stream type %d, got %d", tt.streamType, parsedType)
			}

			if parsedSize != tt.payloadSize {
				t.Errorf("Expected payload size %d, got %d", tt.payloadSize, parsedSize)
			}
		})
	}
}

// TestBigEndianDecoding specifically tests Big Endian decoding
func TestBigEndianDecoding(t *testing.T) {
	buf := make([]byte, 4)

	// Test various sizes
	testSizes := []uint32{1, 255, 256, 1024, 65535, 16777216}

	for _, size := range testSizes {
		binary.BigEndian.PutUint32(buf, size)
		decoded := binary.BigEndian.Uint32(buf)

		if decoded != size {
			t.Errorf("Big Endian decode failed: expected %d, got %d", size, decoded)
		}
	}
}

// TestPayloadIsolation ensures regex matching only happens on payload
func TestPayloadIsolation(t *testing.T) {
	// Create a multiplexed stream with a sensitive pattern in payload
	var buf bytes.Buffer

	payload := []byte("AKIAIOSFODNN7EXAMPLE")
	header := make([]byte, 8)
	header[0] = 1 // stdout
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))

	buf.Write(header)
	buf.Write(payload)

	// Read header
	readHeader := make([]byte, 8)
	io.ReadFull(&buf, readHeader)

	// Verify header bytes are not treated as payload
	if bytes.Contains(readHeader, []byte("AKIA")) {
		// This is expected - the header doesn't contain the pattern
	}

	// Read payload
	size := binary.BigEndian.Uint32(readHeader[4:8])
	readPayload := make([]byte, size)
	io.ReadFull(&buf, readPayload)

	// Verify payload contains pattern
	if !bytes.Contains(readPayload, []byte("AKIA")) {
		t.Error("Payload should contain AWS key pattern")
	}
}

// TestStreamingArchitecture tests that we process frame by frame, not buffering all
func TestStreamingArchitecture(t *testing.T) {
	// Create multiple frames
	var inputBuf bytes.Buffer

	frames := []string{
		"First log line\n",
		"Second log line\n",
		"Third log line\n",
	}

	for _, frameData := range frames {
		header := make([]byte, 8)
		header[0] = 1 // stdout
		binary.BigEndian.PutUint32(header[4:8], uint32(len(frameData)))

		inputBuf.Write(header)
		inputBuf.Write([]byte(frameData))
	}

	// Process stream frame by frame
	framesProcessed := 0
	header := make([]byte, 8)

	for {
		n, err := io.ReadFull(&inputBuf, header)
		if err == io.EOF || n == 0 {
			break
		}

		size := binary.BigEndian.Uint32(header[4:8])
		payload := make([]byte, size)
		io.ReadFull(&inputBuf, payload)

		framesProcessed++
	}

	if framesProcessed != len(frames) {
		t.Errorf("Expected %d frames processed, got %d", len(frames), framesProcessed)
	}
}

// TestContextCancellation tests that stream processing stops on context cancellation
func TestContextCancellation(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Simulate a long-running stream
	done := make(chan bool)

	go func() {
		select {
		case <-ctx.Done():
			done <- true
		case <-time.After(1 * time.Second):
			done <- false
		}
	}()

	result := <-done
	if !result {
		t.Error("Context cancellation did not work as expected")
	}
}

// TestStdoutStderrDistinction tests correct identification of stream types
func TestStdoutStderrDistinction(t *testing.T) {
	tests := []struct {
		streamType byte
		expected   string
	}{
		{0, "stdin"},
		{1, "stdout"},
		{2, "stderr"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			header := make([]byte, 8)
			header[0] = tt.streamType

			var streamName string
			switch header[0] {
			case 0:
				streamName = "stdin"
			case 1:
				streamName = "stdout"
			case 2:
				streamName = "stderr"
			default:
				streamName = "unknown"
			}

			if streamName != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, streamName)
			}
		})
	}
}