package tests

import (
	"errors"
	"net"
	"testing"

	"repository_after/proxy"
)

// Req 4 & 9: Read Total Length then exactly that many bytes; truncated header must return ErrTruncatedHeader.
func TestTruncatedHeader(t *testing.T) {
	client, server := net.Pipe()
	sig := []byte{0x0D, 0x0A, 0x0D, 0x0A, 0x00, 0x0D, 0x0A, 0x51, 0x55, 0x49, 0x54, 0x0A}
	go func() {
		server.Write(sig)
		server.Close()
	}()
	_, err := WrapProxyConn(client)
	if err == nil {
		RecordResult("TestTruncatedHeader", false, "expected error")
		t.Fatal("expected error")
		return
	}
	if !errors.Is(err, proxy.ErrTruncatedHeader) {
		RecordResult("TestTruncatedHeader", false, err.Error())
		t.Errorf("expected ErrTruncatedHeader, got %v", err)
		return
	}
	RecordResult("TestTruncatedHeader", true, "")
}
