package tests

import (
	"encoding/binary"
	"errors"
	"net"
	"testing"

	"repository_after/proxy"
)

// Req 4 (strengthening): Truncation in the address block must return ErrTruncatedHeader.
func TestTruncatedAddressBlock(t *testing.T) {
	client, server := net.Pipe()
	sig := []byte{0x0D, 0x0A, 0x0D, 0x0A, 0x00, 0x0D, 0x0A, 0x51, 0x55, 0x49, 0x54, 0x0A}
	header := make([]byte, 4)
	header[0] = 0x21
	header[1] = 0x11
	binary.BigEndian.PutUint16(header[2:4], 12)
	go func() {
		server.Write(sig)
		server.Write(header)
		server.Write([]byte{1, 2, 3, 4, 5}) // only 5 bytes of 12-byte address block
		server.Close()
	}()
	_, err := WrapProxyConn(client)
	if err == nil {
		RecordResult("TestTruncatedAddressBlock", false, "expected error")
		t.Fatal("expected error")
		return
	}
	if !errors.Is(err, proxy.ErrTruncatedHeader) {
		RecordResult("TestTruncatedAddressBlock", false, err.Error())
		t.Errorf("expected ErrTruncatedHeader, got %v", err)
		return
	}
	RecordResult("TestTruncatedAddressBlock", true, "")
}
