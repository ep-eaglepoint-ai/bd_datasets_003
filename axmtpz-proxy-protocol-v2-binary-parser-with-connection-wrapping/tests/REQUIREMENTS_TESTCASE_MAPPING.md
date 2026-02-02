# Requirements–Testcase Mapping

## Problem Statement (Summary)

Implement PROXY Protocol v2 (Binary) receiver in pure Go: connection wrapper that validates 12-byte signature, extracts source/destination addresses (IPv4/IPv6) and ports, uses `encoding/binary` Big-Endian, variable header size, custom `net.Conn` wrapper, buffered payload in `Read()`, specific errors for invalid/truncated header, `net.IP` for addresses, no external libs.

---

## Mapping Table

| Req | Requirement | Primary Test(s) | Secondary / Strengthening |
|-----|--------------|-----------------|---------------------------|
| **1** | Must NOT use external libraries (standard `net` only) | `TestNoExternalLibraries` | — |
| **2** | Must validate exact 12-byte binary signature | `TestValidIPv4FullHeader`, `TestInvalidSignature` | `TestExactSignatureRequired` (one-byte wrong → ErrInvalidSignature) |
| **3** | Must use `binary.BigEndian` for 16-bit Length and Port | `TestUsesBinaryBigEndian` | `TestValidIPv4FullHeader`, `TestProxyV2IPv4` (port parsing) |
| **4** | Must read Total Length first, then exactly that many bytes for full header | `TestTruncatedHeader`, `TestPayloadBufferedInRead` | `TestTruncatedAddressBlock`, `TestLengthFieldReadExactly` |
| **5** | Must correctly differentiate IPv4 (4-byte) and IPv6 (16-byte) by Family byte | `TestProxyV2IPv4`, `TestProxyV2IPv6` | `TestValidIPv4FullHeader` |
| **6** | Must return custom struct implementing `net.Conn` | `TestProxyConnImplementsNetConn` | `TestNetConnDelegation` (Write, Close, SetDeadline) |
| **7** | RemoteAddr() must return extracted Client IP/Port, not LB | `TestRemoteAddrReturnsClientIP` | `TestValidIPv4FullHeader`, `TestProxyV2IPv4`, `TestProxyV2IPv6` |
| **8** | Payload after PROXY header must be buffered and returned in Read() | `TestPayloadBufferedInRead` | `TestValidIPv4FullHeader`, `TestProxyV2IPv4`, `TestHandshakeBlocksUntilComplete` |
| **9** | Must return specific error if signature invalid or header truncated | `TestInvalidSignature`, `TestTruncatedHeader` | `TestExactSignatureRequired`, `TestTruncatedAddressBlock` |
| **10** | Must use `net.IP` types for address storage | `TestUsesNetIP` | `TestProxyV2IPv4`, `TestProxyV2IPv6` (RemoteAddr().(*net.TCPAddr).IP) |
| **(11)** | Handshake on wrap; block until header complete (implied) | `TestHandshakeBlocksUntilComplete` | — |

---

## Coverage Summary

- **Req 1–10**: Each has at least one dedicated test.
- **Req 11** (handshake blocks): Covered by `TestHandshakeBlocksUntilComplete` (byte-by-byte write, then payload "done").
- **Strengthening tests added**: `TestExactSignatureRequired`, `TestTruncatedAddressBlock`, `TestLengthFieldReadExactly`, `TestNetConnDelegation` for stronger Req 2, 4, and 6.
