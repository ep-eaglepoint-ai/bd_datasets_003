package tests

import (
	"errors"
	"net"
	"testing"

	"repository_after/proxy"
)

// Req 2 (strengthening): Exact 12-byte signature required; one byte wrong must return ErrInvalidSignature.
func TestExactSignatureRequired(t *testing.T) {
	client, server := net.Pipe()
	// Valid signature with last byte wrong: 0x0B instead of 0x0A
	sigWrong := []byte{0x0D, 0x0A, 0x0D, 0x0A, 0x00, 0x0D, 0x0A, 0x51, 0x55, 0x49, 0x54, 0x0B}
	go func() {
		server.Write(sigWrong)
		server.Close()
	}()
	_, err := WrapProxyConn(client)
	if err == nil {
		RecordResult("TestExactSignatureRequired", false, "expected error")
		t.Fatal("expected error")
		return
	}
	if !errors.Is(err, proxy.ErrInvalidSignature) {
		RecordResult("TestExactSignatureRequired", false, err.Error())
		t.Errorf("expected ErrInvalidSignature, got %v", err)
		return
	}
	RecordResult("TestExactSignatureRequired", true, "")
}
