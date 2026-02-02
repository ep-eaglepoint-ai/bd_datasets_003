package tests

import (
	"fmt"
	"net"
	"testing"
)

// Req 5 (IPv6): Differentiate and parse IPv6.
func TestProxyV2IPv6(t *testing.T) {
	client, server := net.Pipe()
	srcIP := make([]byte, 16)
	srcIP[15] = 1
	header := ValidIPv6Header(srcIP, 54321, 443)
	go func() {
		server.Write(header)
		server.Write([]byte("ok"))
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestProxyV2IPv6", false, err.Error())
		t.Fatal(err)
		return
	}
	addr := conn.RemoteAddr().(*net.TCPAddr)
	if addr.Port != 54321 {
		RecordResult("TestProxyV2IPv6", false, fmt.Sprintf("port %d", addr.Port))
		t.Errorf("port %d", addr.Port)
		return
	}
	if !addr.IP.Equal(net.IPv6loopback) {
		RecordResult("TestProxyV2IPv6", false, addr.IP.String())
		t.Errorf("IP %s", addr.IP)
		return
	}
	buf := make([]byte, 2)
	n, _ := conn.Read(buf)
	if string(buf[:n]) != "ok" {
		RecordResult("TestProxyV2IPv6", false, string(buf[:n]))
		t.Errorf("payload %q", buf[:n])
		return
	}
	RecordResult("TestProxyV2IPv6", true, "")
}
