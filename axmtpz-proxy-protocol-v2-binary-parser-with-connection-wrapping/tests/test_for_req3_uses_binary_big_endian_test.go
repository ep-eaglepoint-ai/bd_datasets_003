package tests

import (
	"fmt"
	"net"
	"testing"
)

// Req 3: Must use binary.BigEndian for 16-bit Length and Port. Verified by port 0x1234 -> 4660.
func TestUsesBinaryBigEndian(t *testing.T) {
	client, server := net.Pipe()
	header := ValidIPv4Header([]byte{1, 2, 3, 4}, 0x1234, 80)
	go func() {
		server.Write(header)
		server.Close()
	}()
	conn, err := WrapProxyConn(client)
	if err != nil {
		RecordResult("TestUsesBinaryBigEndian", false, err.Error())
		t.Fatal(err)
		return
	}
	addr := conn.RemoteAddr().(*net.TCPAddr)
	if addr.Port != 4660 {
		RecordResult("TestUsesBinaryBigEndian", false, fmt.Sprintf("port got %d expected 4660", addr.Port))
		t.Errorf("port got %d expected 4660", addr.Port)
		return
	}
	RecordResult("TestUsesBinaryBigEndian", true, "")
}
