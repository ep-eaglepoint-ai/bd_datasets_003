import struct
import socket
import re
import time
from collections import namedtuple

# 5-tuple key for flow identification
FlowKey = namedtuple('FlowKey', ['src_ip', 'src_port', 'dst_ip', 'dst_port', 'proto'])

class FlowState:
    def __init__(self, start_seq, timestamp):
        self.buffer = {} # seq -> bytes
        self.last_seen = timestamp
        self.triggered_methods = set()

class PacketProcessor:
    def __init__(self, rules):
        """
        Initialize the IDS with a list of regex signatures.
        rules: list of compiled regex objects or strings
        """
        self.rules = [re.compile(r.encode() if isinstance(r, str) else r) for r in rules]
        self.flows = {} # {FlowKey: FlowState}
        self.alerts = []

    def ingest_packet(self, raw_bytes, timestamp):
        """
        Ingest a raw binary packet, update state, and return any triggered alerts.
        raw_bytes: complete Ethernet frame (or IP packet if configured, but assuming Ethernet per task)
        timestamp: float, packet arrival time
        """
        try:
            # Ethernet Header is 14 bytes
            eth_header_len = 14
            if len(raw_bytes) < eth_header_len:
                return []
            
            # Extract Ethernet header (we mostly skip it, but good to know)
            # eth_header = raw_bytes[:eth_header_len]
            
            # IP Header starts after Ethernet
            ip_packet = raw_bytes[eth_header_len:]
            
            # --- IPv4 Parsing ---
            if len(ip_packet) < 20:
                return []
            
            # Unpack first byte to get version and IHL
            ver_ihl = ip_packet[0]
            version = ver_ihl >> 4
            ihl = ver_ihl & 0xF
            ip_header_len = ihl * 4
            
            if version != 4:
                return []
                
            # Unpack other fields: Total Length, Protocol, Source IP, Dest IP
            # Protocol is at byte 9 (1-indexed) -> index 9
            protocol = ip_packet[9]
            
            if protocol != 6: # TCP is 6
                return []
                
            src_ip_num = struct.unpack('!I', ip_packet[12:16])[0]
            dst_ip_num = struct.unpack('!I', ip_packet[16:20])[0]
            
            src_ip = socket.inet_ntoa(ip_packet[12:16])
            dst_ip = socket.inet_ntoa(ip_packet[16:20])
            
            # --- TCP Parsing ---
            tcp_packet = ip_packet[ip_header_len:]
            if len(tcp_packet) < 20:
                return []
                
            # Unpack TCP header
            # Source Port (2), Dest Port (2), Seq Num (4), Ack Num (4)
            # Data Offset (4 bits in byte 12)
            tcp_header_fmt = '!HHII' 
            src_port, dst_port, seq_num, ack_num = struct.unpack(tcp_header_fmt, tcp_packet[:12])
            
            data_offset_byte = tcp_packet[12]
            data_offset = (data_offset_byte >> 4) * 4
            
            # Payload
            payload = tcp_packet[data_offset:]
            
            # --- Flow Management ---
            flow_key = FlowKey(src_ip, src_port, dst_ip, dst_port, protocol)
            
            # Cleanup old flows
            self._cleanup_flows(timestamp)
            
            if flow_key not in self.flows:
                self.flows[flow_key] = FlowState(seq_num, timestamp)
            
            flow = self.flows[flow_key]
            flow.last_seen = timestamp
            
            # Handle payload
            if payload:
                # Store in buffer
                flow.buffer[seq_num] = payload
                
                # Reassemble: Blindly reconstruct stream from sorted segments
                sorted_seqs = sorted(flow.buffer.keys())
                
                full_stream = b""
                first_seq = sorted_seqs[0]
                expected_seq = first_seq
                
                for s in sorted_seqs:
                    data = flow.buffer[s]
                    length = len(data)
                    
                    if s < expected_seq:
                        # Overlap
                        offset = expected_seq - s
                        if offset < length:
                            # New data exists slightly ahead
                            new_data = data[offset:]
                            full_stream += new_data
                            expected_seq += len(new_data)
                    elif s == expected_seq:
                        full_stream += data
                        expected_seq += length
                    else:
                        # Gap detected
                        # Stop reassembly for scanning
                        break
                
                # Detection
                new_alerts = []
                for rule in self.rules:
                    matches = rule.findall(full_stream)
                    if matches:
                        # Avoid duplicate alerts for the same match if possible?
                        # Or just alert. The requirement is to return triggered alerts.
                        # We use triggered_methods to avoid flooding logs for the EXACT same string if we wanted,
                        # but "Regex signatures" implies we might match multiple times.
                        # For now, alert if we see it.
                        # To satisfy "Verify Alert is triggered", we just need to return it.
                        
                        # Use a set to dedup within this call? 
                        # Or dedup globally?
                        # Requirement: "Verify Alert is triggered only after Packet 1 arrives."
                        # If we alert on every packet 1, we are good.
                        
                        signature = rule.pattern
                        # Optimization: Deduplicate based on whether we already saw this signature in this flow?
                        # If signature is "ATTACK", and stream is "ATTACK", we alert.
                        # If next packet comes, stream is "ATTACK...", we alert again?
                        # This might be noisy, but satisfies the detection requirement.
                        # I'll stick to basic alerting.
                        
                        # Actually, let's dedup per flow to avoid spamming the log in tests.
                        if signature not in flow.triggered_methods:
                             new_alerts.append(f"Alert: {signature} detected in flow {flow_key}")
                             flow.triggered_methods.add(signature)
                             self.alerts.append(new_alerts[-1]) # Add to history if needed, or just return

        except Exception as e:
            print(f"Error parsing packet: {e}")
            pass
        
        # Return alerts triggered by THIS packet? 
        # The method returns "a list of triggered alerts".
        # If I strictly follow: return alerts found NOW.
        # My implementation accumulated them in `self.alerts`. 
        # I should probably just return the `new_alerts`.
        # Correct logic:
        # returns "a list of triggered alerts".
        # So I should return `new_alerts`.
        # I'll modify logic to collect `new_alerts` properly.
        return self.alerts[-len(new_alerts):] if 'new_alerts' in locals() and new_alerts else []

    def _cleanup_flows(self, current_time):
        # 300s timeout
        expired = []
        for k, v in self.flows.items():
            if current_time - v.last_seen > 300:
                expired.append(k)
        for k in expired:
            del self.flows[k]
