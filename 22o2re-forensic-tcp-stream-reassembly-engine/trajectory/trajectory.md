# Trajectory


## The Problem: Simple TCP reassembly tools fail to correctly assemble TCP streams when faced with:

- **Retransmissions:** duplicate data from repeated packets  
- **Overlaps:** segments that partially or fully overlap due to different segmentation  
- **Wrap-arounds:** sequence numbers exceeding `2^32 - 1` and restarting at `0`  

Current assembler tools often:
- Sort PCAP (Packet Capture) files by timestamp (unreliable)  
- Concatenate packets by sequence number without handling duplicates, overlaps, or wrap-arounds  
As a result, packets with large sequence numbers may be left out of the final output, corrupting the reconstructed stream.

## The Solution: Implement TCP Assembler that follow RFC 793 logic

1. _Reordering:_ Buffer out-of-order segments to assemble the stream correctly.  
2. _Serial Number Arithmetic:_ Use RFC 793 / RFC 1982 logic to compare and sort sequence numbers, supporting _wrap-around_ from `2^32-1` back to `0`.  
3. _Payload Extraction:_ Strip all Layer 2/3/4 headers and return only the raw application bytes.  
4. _Duplicate Handling:_ Discard duplicate segments to avoid repeating payload data in the output.  
5. _Overlap Handling:_ Ensure each byte position in the stream is written at most once; the first valid byte takes precedence.  
6. _Hole Detection:_ Identify missing chunks of data. If the stream cannot be fully reconstructed due to missing packets, raise a `StreamGapError`.  
7. _Empty ACKs:_ Ignore packets with no payload (pure ACKs) as they do not contribute to the application data.  
8. _Testing:_ Comprehensive tests ensure all requirements are correctly implemented.


## Recomended Resources
- RFC 1982 Serial Number Arithmetic
- TCP/IP Networking fundamentals
- Buffer  Managment Techniques
- Python scapy library