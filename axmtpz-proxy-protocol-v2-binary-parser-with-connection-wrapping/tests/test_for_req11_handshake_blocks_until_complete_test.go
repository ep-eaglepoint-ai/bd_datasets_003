package tests

import (
	"fmt"
	"net"
	"testing"
)

// Req 11: Handshake immediately upon wrap; block payload reads until handshake completes.
func TestHandshakeBlocksUntilComplete(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{1, 2, 3, 4}, 1111, 80)
	go func() {
		for _, b := range header {
			server.Write([]byte{b})
		}
		server.Write([]byte("done"))
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestHandshakeBlocksUntilComplete", false, err.Error())
		t.Fatal(err)
		return
	}
	buf := make([]byte, 4)
	n, _ := conn.Read(buf)
	if string(buf[:n]) != "done" {
		RecordResult("TestHandshakeBlocksUntilComplete", false, fmt.Sprintf("got %q", buf[:n]))
		t.Errorf("got %q", buf[:n])
		return
	}
	RecordResult("TestHandshakeBlocksUntilComplete", true, "")
}
