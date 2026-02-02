package proxy

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"net"
)

// PROXY v2 fixed 12-byte signature: \r\n\r\n\0\r\nQUIT\n
var proxyV2Signature = []byte{0x0D, 0x0A, 0x0D, 0x0A, 0x00, 0x0D, 0x0A, 0x51, 0x55, 0x49, 0x54, 0x0A}

var (
	ErrInvalidSignature = errors.New("invalid proxy v2 signature")
	ErrTruncatedHeader  = errors.New("truncated proxy v2 header")
)

const (
	familyIPv4 = 0x10 // TCP over IPv4 (high nibble)
	familyIPv6 = 0x20 // TCP over IPv6 (high nibble)
)

// ProxyConn wraps a net.Conn after consuming and parsing the PROXY protocol v2 header.
// RemoteAddr() returns the extracted client address; Read() returns application payload.
type ProxyConn struct {
	net.Conn
	srcAddr net.Addr
	buffer  *bytes.Reader
}

// WrapProxyConn performs the PROXY v2 handshake on conn: reads and validates the header,
// extracts the client address, and returns a ProxyConn that exposes the remainder as the stream.
// Handshake blocks until the full header is read; payload is only available after return.
func WrapProxyConn(conn net.Conn) (*ProxyConn, error) {
	sig := make([]byte, 12)
	if _, err := io.ReadFull(conn, sig); err != nil {
		return nil, ErrTruncatedHeader
	}
	if !bytes.Equal(sig, proxyV2Signature) {
		return nil, ErrInvalidSignature
	}

	header := make([]byte, 4)
	if _, err := io.ReadFull(conn, header); err != nil {
		return nil, ErrTruncatedHeader
	}
	length := binary.BigEndian.Uint16(header[2:4])

	addrData := make([]byte, length)
	if _, err := io.ReadFull(conn, addrData); err != nil {
		return nil, ErrTruncatedHeader
	}

	var srcAddr net.Addr
	family := header[1]
	switch family & 0xF0 {
	case familyIPv4:
		if length < 12 {
			return nil, ErrTruncatedHeader
		}
		srcIP := make(net.IP, 4)
		copy(srcIP, addrData[0:4])
		srcPort := binary.BigEndian.Uint16(addrData[8:10])
		srcAddr = &net.TCPAddr{IP: srcIP, Port: int(srcPort)}
	case familyIPv6:
		if length < 36 {
			return nil, ErrTruncatedHeader
		}
		srcIP := make(net.IP, 16)
		copy(srcIP, addrData[0:16])
		srcPort := binary.BigEndian.Uint16(addrData[32:34])
		srcAddr = &net.TCPAddr{IP: srcIP, Port: int(srcPort)}
	default:
		// Unsupported family; still consume the header, expose a zero address or keep conn
		srcAddr = &net.TCPAddr{}
	}

	return &ProxyConn{
		Conn:    conn,
		srcAddr: srcAddr,
		buffer:  bytes.NewReader(nil),
	}, nil
}

// Read reads from the buffered payload first, then from the underlying connection.
func (p *ProxyConn) Read(b []byte) (int, error) {
	if p.buffer.Len() > 0 {
		return p.buffer.Read(b)
	}
	return p.Conn.Read(b)
}

// RemoteAddr returns the extracted client address from the PROXY header, not the load balancer.
func (p *ProxyConn) RemoteAddr() net.Addr {
	return p.srcAddr
}
