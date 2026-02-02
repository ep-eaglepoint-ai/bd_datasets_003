package tests

import (
	"fmt"
	"net"
	"testing"
)

// Req 7: RemoteAddr() returns extracted client IP/port, not load balancer.
func TestRemoteAddrReturnsClientIP(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{192, 168, 1, 100}, 12345, 443)
	go func() {
		server.Write(header)
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestRemoteAddrReturnsClientIP", false, err.Error())
		t.Fatal(err)
		return
	}
	addr := conn.RemoteAddr().(*net.TCPAddr)
	if addr.IP.String() != "192.168.1.100" || addr.Port != 12345 {
		RecordResult("TestRemoteAddrReturnsClientIP", false, fmt.Sprintf("%s:%d", addr.IP, addr.Port))
		t.Errorf("RemoteAddr %s:%d", addr.IP, addr.Port)
		return
	}
	RecordResult("TestRemoteAddrReturnsClientIP", true, "")
}
