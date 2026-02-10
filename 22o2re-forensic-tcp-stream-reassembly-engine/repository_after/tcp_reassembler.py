from scapy.layers.inet import TCP
from scapy.packet import Raw
from functools import cmp_to_key

SEQ_MOD = 2 ** 32


class StreamGapError(Exception):
    pass


def seq_less(a, b):
    """RFC 1982 serial number arithmetic comparison"""
    return ((a - b) % SEQ_MOD) > (SEQ_MOD // 2)


class TCPReassembler:
    def __init__(self, packets):
        self.packets = packets

    def reassemble(self) -> bytes:
        segments = []

        for pkt in self.packets:
            if TCP not in pkt or not pkt.haslayer(Raw):
                continue

            payload = bytes(pkt[Raw].load)
            if not payload:
                continue

            start = pkt[TCP].seq
            end = (start + len(payload)) % SEQ_MOD
            segments.append((start, end, payload))

        if not segments:
            return b""

        # Sort by sequence number (handling wrap-around)
        segments.sort(key=cmp_to_key(lambda a, b: -1 if seq_less(a[0], b[0]) else 1))

        stream = bytearray()
        expected_seq = segments[0][0]

        for start, end, payload in segments:
            if not seq_less(expected_seq, end):
                continue

            if seq_less(expected_seq, start):
                raise StreamGapError(f"Missing data: expected {expected_seq}, got {start}")

            offset = (expected_seq - start) % SEQ_MOD
            new_data = payload[offset:]
            
            stream.extend(new_data)
            expected_seq = (expected_seq + len(new_data)) % SEQ_MOD
        return bytes(stream)
