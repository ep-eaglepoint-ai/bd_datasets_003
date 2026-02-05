package tests

import (
	"fmt"
	"net"
	"testing"
)

// Req 5, 7, 8, 10: IPv4 parsing, RemoteAddr client IP, payload buffered, net.IP storage.
func TestProxyV2IPv4(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{1, 2, 3, 4}, 9999, 80)
	go func() {
		server.Write(header)
		server.Write([]byte("payload"))
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestProxyV2IPv4", false, err.Error())
		t.Fatal(err)
		return
	}
	addr := conn.RemoteAddr().(*net.TCPAddr)
	if addr.IP.String() != "1.2.3.4" || addr.Port != 9999 {
		RecordResult("TestProxyV2IPv4", false, fmt.Sprintf("addr %s:%d", addr.IP, addr.Port))
		t.Errorf("addr %s:%d", addr.IP, addr.Port)
		return
	}
	buf := make([]byte, 10)
	n, _ := conn.Read(buf)
	if string(buf[:n]) != "payload" {
		RecordResult("TestProxyV2IPv4", false, fmt.Sprintf("Read %q", buf[:n]))
		t.Errorf("Read %q", buf[:n])
		return
	}
	RecordResult("TestProxyV2IPv4", true, "")
}
