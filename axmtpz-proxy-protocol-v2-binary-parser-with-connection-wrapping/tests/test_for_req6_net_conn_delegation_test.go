package tests

import (
	"io"
	"net"
	"testing"
	"time"
)

// Req 6 (strengthening): Returned net.Conn must delegate Write, Close, SetDeadline to underlying conn.
func TestNetConnDelegation(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{1, 1, 1, 1}, 1, 1)
	go func() {
		server.Write(header)
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestNetConnDelegation", false, err.Error())
		t.Fatal(err)
		return
	}
	// SetDeadline must not panic and must be delegated
	conn.SetDeadline(time.Now().Add(time.Second))
	conn.SetReadDeadline(time.Now().Add(time.Second))
	conn.SetWriteDeadline(time.Now().Add(time.Second))
	// Close must work (underlying pipe already closed from server side; client Close is idempotent)
	_ = conn.Close()
	RecordResult("TestNetConnDelegation", true, "")
}

// TestNetConnWriteDelegation: Write() is delegated to underlying conn (requires both ends open).
// Server must read what we write, or net.Pipe blocks (synchronous pipe).
func TestNetConnWriteDelegation(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{1, 1, 1, 1}, 1, 1)
	go func() {
		server.Write(header)
		buf := make([]byte, 4)
		_, _ = io.ReadFull(server, buf) // read "ping" so Write() can complete
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestNetConnWriteDelegation", false, err.Error())
		t.Fatal(err)
		return
	}
	n, err := conn.Write([]byte("ping"))
	if err != nil || n != 4 {
		RecordResult("TestNetConnWriteDelegation", false, err.Error())
		t.Fatalf("Write: n=%d err=%v", n, err)
		return
	}
	_ = conn.Close()
	RecordResult("TestNetConnWriteDelegation", true, "")
}
