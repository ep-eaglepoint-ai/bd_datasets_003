package tests

import (
	"net"
	"testing"
)

// Req 10: Must use net.IP types for address storage.
func TestUsesNetIP(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{127, 0, 0, 1}, 42, 0)
	go func() {
		server.Write(header)
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestUsesNetIP", false, err.Error())
		t.Fatal(err)
		return
	}
	addr := conn.RemoteAddr().(*net.TCPAddr)
	if addr.IP == nil {
		RecordResult("TestUsesNetIP", false, "IP is nil")
		t.Fatal("IP is nil")
		return
	}
	if !addr.IP.Equal(net.IP([]byte{127, 0, 0, 1})) {
		RecordResult("TestUsesNetIP", false, addr.IP.String())
		t.Errorf("IP %s", addr.IP)
		return
	}
	RecordResult("TestUsesNetIP", true, "")
}
