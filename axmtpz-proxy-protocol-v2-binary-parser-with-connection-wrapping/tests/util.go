package tests

import (
	"encoding/binary"
	"flag"
	"net"
	"os"
	"strings"
	"time"

	"repository_after/proxy"
)

var repoPathFlag = flag.String("repo", "", "Path to repository_after")
var testResults []TestResult
var testFile = "/app/tests"
var startTime time.Time

type TestResult struct {
	Name    string
	Passed  bool
	Message string
}

func RecordResult(name string, passed bool, message string) {
	testResults = append(testResults, TestResult{Name: name, Passed: passed, Message: message})
}

func GetRepoPath() string {
	var raw string
	if *repoPathFlag != "" {
		raw = *repoPathFlag
	} else if envPath := os.Getenv("REPO_PATH"); envPath != "" {
		raw = envPath
	} else {
		raw = "/app/repository_after"
	}
	if idx := strings.LastIndex(raw, "/app/"); idx >= 0 {
		raw = "/app/" + raw[idx+5:]
	}
	return raw
}

func WrapProxyConn(c net.Conn) (net.Conn, error) {
	return proxy.WrapProxyConn(c)
}

func ValidIPv4Header(srcIP []byte, srcPort, dstPort uint16) []byte {
	sig := []byte{0x0D, 0x0A, 0x0D, 0x0A, 0x00, 0x0D, 0x0A, 0x51, 0x55, 0x49, 0x54, 0x0A}
	h := make([]byte, 0, 28)
	h = append(h, sig...)
	h = append(h, 0x21, 0x11)
	length := uint16(12)
	buf := make([]byte, 2)
	binary.BigEndian.PutUint16(buf, length)
	h = append(h, buf...)
	h = append(h, srcIP...)
	h = append(h, 0, 0, 0, 0)
	binary.BigEndian.PutUint16(buf, srcPort)
	h = append(h, buf...)
	binary.BigEndian.PutUint16(buf, dstPort)
	h = append(h, buf...)
	return h
}

func ValidIPv6Header(srcIP []byte, srcPort, dstPort uint16) []byte {
	sig := []byte{0x0D, 0x0A, 0x0D, 0x0A, 0x00, 0x0D, 0x0A, 0x51, 0x55, 0x49, 0x54, 0x0A}
	h := make([]byte, 0, 12+4+36)
	h = append(h, sig...)
	h = append(h, 0x21, 0x21)
	length := uint16(36)
	buf := make([]byte, 2)
	binary.BigEndian.PutUint16(buf, length)
	h = append(h, buf...)
	h = append(h, srcIP...)
	h = append(h, make([]byte, 16)...)
	binary.BigEndian.PutUint16(buf, srcPort)
	h = append(h, buf...)
	binary.BigEndian.PutUint16(buf, dstPort)
	h = append(h, buf...)
	return h
}
