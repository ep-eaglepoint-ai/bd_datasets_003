package tests

import (
	"errors"
	"net"
	"testing"

	"repository_after/proxy"
)

// Req 9: Specific error for invalid signature.
func TestInvalidSignature(t *testing.T) {
	client, server := net.Pipe()
	go func() {
		server.Write([]byte("invalid_sig!!"))
		server.Close()
	}()
	_, err := WrapProxyConn(client)
	if err == nil {
		RecordResult("TestInvalidSignature", false, "expected error")
		t.Fatal("expected error")
		return
	}
	if !errors.Is(err, proxy.ErrInvalidSignature) {
		RecordResult("TestInvalidSignature", false, err.Error())
		t.Errorf("expected ErrInvalidSignature, got %v", err)
		return
	}
	RecordResult("TestInvalidSignature", true, "")
}
