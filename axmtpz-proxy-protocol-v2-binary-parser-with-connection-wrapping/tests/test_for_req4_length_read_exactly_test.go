package tests

import (
	"fmt"
	"net"
	"testing"
)

// Req 4 (strengthening): Parser reads exactly "length" bytes for address block; payload after header is returned in Read().
func TestLengthFieldReadExactly(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{10, 20, 30, 40}, 999, 80)
	tail := []byte("application-payload")
	go func() {
		server.Write(header)
		server.Write(tail)
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestLengthFieldReadExactly", false, err.Error())
		t.Fatal(err)
		return
	}
	buf := make([]byte, 50)
	n, err := conn.Read(buf)
	if err != nil && n == 0 {
		RecordResult("TestLengthFieldReadExactly", false, err.Error())
		t.Fatal(err)
		return
	}
	if string(buf[:n]) != string(tail) {
		RecordResult("TestLengthFieldReadExactly", false, fmt.Sprintf("got %q", buf[:n]))
		t.Errorf("Read() should return payload after header exactly; got %q", buf[:n])
		return
	}
	RecordResult("TestLengthFieldReadExactly", true, "")
}
