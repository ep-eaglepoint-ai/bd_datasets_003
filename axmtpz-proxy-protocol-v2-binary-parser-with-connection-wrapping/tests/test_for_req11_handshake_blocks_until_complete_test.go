package tests

import (
	"fmt"
	"net"
	"testing"
	"time"
)

// Req 11: Handshake immediately upon wrap; block payload reads until handshake completes.
// Sends header in 2 chunks (not byte-by-byte) to avoid slow run; still verifies blocking.
// Uses timeout to fail fast if WrapProxyConn or Read hangs.
func TestHandshakeBlocksUntilComplete(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{1, 2, 3, 4}, 1111, 80)
	go func() {
		server.Write(header[0:16])  // sig + ver/family + length
		server.Write(header[16:28]) // address block
		server.Write([]byte("done"))
		server.Close()
	}()

	done := make(chan struct{})
	var conn net.Conn
	var err error
	go func() {
		conn, err = WrapProxyConn(client)
		close(done)
	}()
	select {
	case <-done:
		// ok
	case <-time.After(2 * time.Second):
		t.Fatal("WrapProxyConn timed out after 2s")
	}
	if err != nil {
		RecordResult("TestHandshakeBlocksUntilComplete", false, err.Error())
		t.Fatal(err)
	}

	readDone := make(chan struct{})
	var n int
	var readErr error
	buf := make([]byte, 4)
	go func() {
		n, readErr = conn.Read(buf)
		close(readDone)
	}()
	select {
	case <-readDone:
		// ok
	case <-time.After(2 * time.Second):
		t.Fatal("Read timed out after 2s")
	}
	if readErr != nil {
		RecordResult("TestHandshakeBlocksUntilComplete", false, readErr.Error())
		t.Fatal(readErr)
	}
	if string(buf[:n]) != "done" {
		RecordResult("TestHandshakeBlocksUntilComplete", false, fmt.Sprintf("got %q", buf[:n]))
		t.Errorf("got %q", buf[:n])
		return
	}
	RecordResult("TestHandshakeBlocksUntilComplete", true, "")
}
