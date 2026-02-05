package tests

import (
	"fmt"
	"net"
	"testing"
)

// Req 2: Must validate the exact 12-byte binary signature. Sends valid IPv4 header and expects success.
func TestValidIPv4FullHeader(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{1, 2, 3, 4}, 4660, 80)
	go func() {
		server.Write(header)
		server.Write([]byte("hello"))
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestValidIPv4FullHeader", false, err.Error())
		t.Fatal(err)
		return
	}
	addr := conn.RemoteAddr().(*net.TCPAddr)
	if addr.IP.String() != "1.2.3.4" || addr.Port != 4660 {
		RecordResult("TestValidIPv4FullHeader", false, fmt.Sprintf("RemoteAddr got %s:%d", addr.IP, addr.Port))
		t.Errorf("RemoteAddr got %s:%d", addr.IP, addr.Port)
		return
	}
	buf := make([]byte, 5)
	n, _ := conn.Read(buf)
	if string(buf[:n]) != "hello" {
		RecordResult("TestValidIPv4FullHeader", false, fmt.Sprintf("Read got %q", buf[:n]))
		t.Errorf("Read got %q", string(buf[:n]))
		return
	}
	RecordResult("TestValidIPv4FullHeader", true, "")
}
