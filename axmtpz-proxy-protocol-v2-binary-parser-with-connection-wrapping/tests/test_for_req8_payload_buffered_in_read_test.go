package tests

import (
	"fmt"
	"net"
	"testing"
)

// Req 8: Payload after header must be buffered and returned in subsequent Read().
func TestPayloadBufferedInRead(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{10, 0, 0, 1}, 8080, 80)
	go func() {
		server.Write(header)
		server.Write([]byte("payload"))
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestPayloadBufferedInRead", false, err.Error())
		t.Fatal(err)
		return
	}
	buf := make([]byte, 20)
	n, err := conn.Read(buf)
	if err != nil && n == 0 {
		RecordResult("TestPayloadBufferedInRead", false, err.Error())
		t.Fatal(err)
		return
	}
	if string(buf[:n]) != "payload" {
		RecordResult("TestPayloadBufferedInRead", false, fmt.Sprintf("got %q", buf[:n]))
		t.Errorf("got %q", buf[:n])
		return
	}
	RecordResult("TestPayloadBufferedInRead", true, "")
}
