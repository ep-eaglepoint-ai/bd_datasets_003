import pytest
import os
import importlib.util
from pathlib import Path
from scapy.layers.inet import IP, TCP
from scapy.packet import Raw


REPO_PATH = os.environ.get("REPO_PATH")
if not REPO_PATH:
    raise EnvironmentError("REPO_PATH environment variable not set. Please set it to the root of the repository.")

repo_path = Path(REPO_PATH)
module_path = repo_path / "tcp_reassembler.py"
if not module_path.exists():
    raise FileNotFoundError(f"tcp_reassembler.py not found in repository at {module_path}")

spec = importlib.util.spec_from_file_location("tcp_reassembler", module_path)
tcp_reassembler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tcp_reassembler)

TCPReassembler = tcp_reassembler.TCPReassembler
StreamGapError = tcp_reassembler.StreamGapError

def make_pkt(seq: int, payload: bytes | None = None):
    """
    Helper to build a minimal TCP packet with optional payload.
    """
    pkt = IP(src="1.1.1.1", dst="2.2.2.2") / TCP(
        sport=1234,
        dport=80,
        seq=seq,
        ack=0,
        flags="PA",
    )
    if payload is not None:
        pkt = pkt / Raw(load=payload)
    return pkt


def test_simple_in_order_reassembly():
    packets = [
        make_pkt(0, b"Hello "),
        make_pkt(6, b"World"),
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"Hello World"


def test_out_of_order_delivery():
    packets = [
        make_pkt(6, b"World"),
        make_pkt(0, b"Hello "),
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"Hello World"


def test_duplicate_retransmission_discarded():
    packets = [
        make_pkt(0, b"ABC"),
        make_pkt(0, b"ABC"),  
        make_pkt(3, b"DEF"),
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"ABCDEF"


def test_overlap_partial():
    """
    A: Seq=0  ABCDEF
    B: Seq=3  DEFGH
    Result:   ABCDEFGH
    """
    packets = [
        make_pkt(0, b"ABCDEF"),
        make_pkt(3, b"DEFGH"),
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"ABCDEFGH"


def test_overlap_full_duplicate():
    packets = [
        make_pkt(0, b"ABCDEFG"),
        make_pkt(0, b"ABCDEFG"),  
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"ABCDEFG"


def test_overlap_superset_retransmission():
    """
    First packet is short, second retransmission contains more data.
    """
    packets = [
        make_pkt(0, b"ABC"),
        make_pkt(0, b"ABCDEFG"),
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"ABCDEFG"


def test_gap_detection_raises():
    packets = [
        make_pkt(0, b"AAAA"),
        make_pkt(10, b"BBBB"),
    ]

    r = TCPReassembler(packets)

    with pytest.raises(StreamGapError):
        r.reassemble()


def test_empty_ack_packets_ignored():
    packets = [
        make_pkt(0, None),
        make_pkt(0, b"Hello"),
        make_pkt(5, None),
        make_pkt(5, b" World"),
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"Hello World"


def test_multiple_out_of_order_with_overlap_and_duplicates():
    packets = [
        make_pkt(6, b"World"),
        make_pkt(0, b"Hello "),
        make_pkt(0, b"Hello "),   
        make_pkt(3, b"lo Wo"),    
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"Hello World"


def test_sequence_number_wraparound():
    """
    Simulate wrap-around at 2^32 boundary.
    """
    max_seq = (2**32) - 3
    s_max_seq = (2**32) - 6

    packets = [
        make_pkt(max_seq, b"ABC"),
        make_pkt(0, b"DEF"),
        make_pkt(s_max_seq, b"XYZ"), 
    ]

    r = TCPReassembler(packets)
    data = r.reassemble()

    assert data == b"XYZABCDEF"
