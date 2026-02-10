import unittest
import struct
import socket
import time

from repository_after.main import PacketProcessor

class TestStatefulIDS(unittest.TestCase):
    def setUp(self):
        self.rules = ["ATTACK"]
        self.ids = PacketProcessor(self.rules)
        self.src_ip = "192.168.1.100"
        self.dst_ip = "10.0.0.1"
        self.src_port = 12345
        self.dst_port = 80

    def create_packet(self, seq, payload, proto=6, time_offset=0):
        # Ethernet Header (14 bytes)
        eth = b'\x00' * 14
        
        # IP Header
        # Ver=4, IHL=5, TotalLen=?, ID=0, Flags=0, TTL=64, Proto=6, Checksum=0
        # SrcIP, DstIP
        version_ihl = (4 << 4) | 5
        total_len = 20 + 20 + len(payload)
        ip_header = struct.pack('!BBHHHBBH4s4s', 
                                version_ihl, 
                                0, # TOS
                                total_len, 
                                0, # ID
                                0, # Flags/Frag
                                64, # TTL
                                proto, # Proto
                                0, # Checksum
                                socket.inet_aton(self.src_ip),
                                socket.inet_aton(self.dst_ip))
        
        # TCP Header
        # SrcPort, DstPort, Seq, Ack, Offset, Flags, Window, Checksum, Urg
        data_offset = (5 << 4)
        tcp_header = struct.pack('!HHIIBBHHH',
                                 self.src_port,
                                 self.dst_port,
                                 seq,
                                 0, # Ack
                                 data_offset,
                                 0, # Flags
                                 8192, # Window
                                 0, # Checksum
                                 0) # Urg
        
        return eth + ip_header + tcp_header + payload

    def test_split_attack(self):
        # Requirement 9: Split Attack: Define signature ATTACK. Send Packet 1 (Seq=100: ATT) and Packet 2 (Seq=103: ACK). Verify Alert is triggered.
        # Requirement 5: Logic (Reassembly): Must only trigger alerts on the reconstructed stream.
        # Requirement 6: Detection: Must support Regex signatures spanning across packet boundaries.
        p1 = self.create_packet(100, b"ATT")
        p2 = self.create_packet(103, b"ACK")
        
        alerts1 = self.ids.ingest_packet(p1, 1000)
        self.assertEqual(len(alerts1), 0)
        
        alerts2 = self.ids.ingest_packet(p2, 1001)
        self.assertTrue(any("ATTACK" in a for a in alerts2))

    def test_out_of_order(self):
        # Requirement 10: Out-of-Order Test: Send Packet 2 (Seq=103: ACK) before Packet 1 (Seq=100: ATT). Verify Alert is triggered only after Packet 1 arrives.
        # Requirement 4: Logic (The Trap): Must buffer out-of-order packets based on SequenceNumber.
        
        ids = PacketProcessor(self.rules) # New instance
        p1 = self.create_packet(100, b"ATT")
        p2 = self.create_packet(103, b"ACK")
        
        # Send P2 (ACK) first
        alerts1 = ids.ingest_packet(p2, 1000)
        self.assertEqual(len(alerts1), 0) # Should buffer, not alert "ACK" (no match)
        
        # Send P1 (ATT)
        alerts2 = ids.ingest_packet(p1, 1001)
        self.assertTrue(any("ATTACK" in a for a in alerts2))

    def test_overlap(self):
        # Requirement 8: Correctness: Handling "Overlapping Segments" (a retransmission that slightly overlaps existing data) is an advanced requirement but essentially: ignore the duplicate bytes.
        # Packet 1: Seq 100, "AT"
        # Packet 2: Seq 101, "TTACK" (Overlaps 'T')
        # Result: "ATTACK"
        
        ids = PacketProcessor(self.rules)
        p1 = self.create_packet(100, b"AT")
        p2 = self.create_packet(101, b"TTACK")
        
        ids.ingest_packet(p1, 1000)
        alerts = ids.ingest_packet(p2, 1001)
        self.assertTrue(any("ATTACK" in a for a in alerts))

    def test_cleanup(self):
        # Requirement 12: Cleanup Test: Send a packet. Simulate T + 301s. Check if the session is removed from memory.
        # Requirement 7: Memory: Must implement a timeout/cleanup mechanism for stale flows.
        p1 = self.create_packet(100, b"DATA")
        self.ids.ingest_packet(p1, 1000)
        
        # Verify flow exists
        self.assertTrue(len(self.ids.flows) > 0)
        
        # Send unrelated packet at T+301
        # To trigger cleanup, we must ingest something
        # Change src_port to ensure it's a different flow
        self.src_port = 54321
        p2 = self.create_packet(500, b"PING", time_offset=301)
        self.ids.ingest_packet(p2, 1301)
        
        keys = [f for f in self.ids.flows.keys() if f.src_port == 12345]
        self.assertEqual(len(keys), 0)

    def test_noise(self):
        # Requirement 11: Noise Test: Send traffic for a different flow. Verify it doesn't corrupt the reassembly of the target flow.
        p1 = self.create_packet(100, b"ATT")
        self.ids.ingest_packet(p1, 1000)
        
        # Send noise (different flow)
        original_port = self.src_port
        self.src_port = 9999
        p_noise = self.create_packet(500, b"GARBAGE")
        self.ids.ingest_packet(p_noise, 1001)
        self.src_port = original_port # Restore
        
        # Send second part of attack
        p2 = self.create_packet(103, b"ACK")
        alerts = self.ids.ingest_packet(p2, 1002)
        
        # Should still detect attack on original flow
        self.assertTrue(any("ATTACK" in a for a in alerts))

if __name__ == '__main__':
    unittest.main()
