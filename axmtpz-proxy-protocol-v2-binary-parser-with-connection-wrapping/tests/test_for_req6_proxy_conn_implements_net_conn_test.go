package tests

import (
	"net"
	"testing"

	"repository_after/proxy"
)

// Req 6: Return custom struct that implements net.Conn.
func TestProxyConnImplementsNetConn(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{1, 1, 1, 1}, 1, 1)
	go func() {
		server.Write(header)
		server.Close()
	}()
	conn, err := proxy.WrapProxyConn(client)
	if err != nil {
		RecordResult("TestProxyConnImplementsNetConn", false, err.Error())
		t.Fatal(err)
		return
	}
	var _ net.Conn = conn
	RecordResult("TestProxyConnImplementsNetConn", true, "")
}
