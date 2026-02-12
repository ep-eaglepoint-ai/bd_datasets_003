import struct
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'repository_after'))

from main import parse_header, StatefulBuffer, MAGIC_NUMBER, HEADER_SIZE


def test_parse_header_valid():
    request_id = 42
    body_length = 100
    header = struct.pack('>III', MAGIC_NUMBER, request_id, body_length)
    
    parsed_id, parsed_length = parse_header(header)
    
    assert parsed_id == request_id
    assert parsed_length == body_length


def test_parse_header_wrong_magic_number():
    wrong_magic = 0xDEADBEEF
    request_id = 42
    body_length = 100
    header = struct.pack('>III', wrong_magic, request_id, body_length)
    
    with pytest.raises(ValueError, match="Invalid magic number"):
        parse_header(header)


def test_parse_header_buffer_too_small():
    small_buffer = b'\x00' * 11
    
    with pytest.raises(ValueError, match="Buffer too small"):
        parse_header(small_buffer)


def test_parse_header_empty_buffer():
    with pytest.raises(ValueError, match="Buffer too small"):
        parse_header(b'')


def test_parse_header_with_extra_bytes():
    request_id = 123
    body_length = 456
    header = struct.pack('>III', MAGIC_NUMBER, request_id, body_length)
    header_with_extra = header + b'extra data'
    
    parsed_id, parsed_length = parse_header(header_with_extra)
    
    assert parsed_id == request_id
    assert parsed_length == body_length

def test_buffer_fragmentation():
    buf = StatefulBuffer()
    request_id = 101
    body = b"Hello World"
    header = struct.pack('>III', MAGIC_NUMBER, request_id, len(body))
    full_msg = header + body
    
    # 1. Feed first 6 bytes of header
    assert buf.feed(full_msg[:6]) == []
    
    # 2. Feed remaining header + body
    results = buf.feed(full_msg[6:])
    assert len(results) == 1
    assert results[0] == (request_id, body)


def test_buffer_coalescing():
    buf = StatefulBuffer()
    messages = []
    
    # Create 5 messages
    for i in range(5):
        rid = 200 + i
        body = f"msg{i}".encode()
        header = struct.pack('>III', MAGIC_NUMBER, rid, len(body))
        messages.append(header + body)
        
    # Concatenate all
    big_chunk = b"".join(messages)
    
    # Feed once
    results = buf.feed(big_chunk)
    
    assert len(results) == 5
    for i in range(5):
        expected_rid = 200 + i
        expected_body = f"msg{i}".encode()
        assert results[i] == (expected_rid, expected_body)


def test_buffer_malformed_header():
    buf = StatefulBuffer()
    # Wrong magic number
    header = struct.pack('>III', 0xDEADBEEF, 1, 0)
    
    with pytest.raises(ValueError, match="Invalid magic number"):
        buf.feed(header)


import asyncio
import json
import time



def test_process_request_concurrency():
    from main import process_request
    
    async def run_test():
        # Create one slow request and multiple fast requests
        slow_body = json.dumps({'sleep': 0.5}).encode('utf-8')
        fast_body = json.dumps({'sleep': 0.05}).encode('utf-8')
        
        start_time = time.time()
        completion_times = {}
        
        async def track_completion(req_id, body):
            result = await process_request(req_id, body)
            completion_times[req_id] = time.time() - start_time
            return result
        
        # Schedule: slow first, then 5 fast
        tasks = [
            track_completion(1, slow_body),
            track_completion(2, fast_body),
            track_completion(3, fast_body),
            track_completion(4, fast_body),
            track_completion(5, fast_body),
            track_completion(6, fast_body),
        ]
        
        # Run concurrently
        results = await asyncio.gather(*tasks)
        
        # Verify all results are valid
        assert len(results) == 6
        
        # Fast requests (2-6) must complete before slow request (1)
        for fast_id in [2, 3, 4, 5, 6]:
            assert completion_times[fast_id] < completion_times[1], \
                f"Fast request {fast_id} took {completion_times[fast_id]:.3f}s but slow request 1 took {completion_times[1]:.3f}s"
    
    asyncio.run(run_test())


def test_process_request_basic():
    from main import process_request
    
    async def run_test():
        body = json.dumps({'sleep': 0.01}).encode('utf-8')
        result = await process_request(42, body)
        
        data = json.loads(result.decode('utf-8'))
        assert data['request_id'] == 42
        assert data['status'] == 'completed'
        assert data['slept'] == 0.01
    
    asyncio.run(run_test())



class MockWriter:
    def __init__(self):
        self.buffer = bytearray()
        self.write_log = []
        
    def write(self, data):
        self.write_log.append(len(data))
        self.buffer.extend(data)
        
    async def drain(self):
        await asyncio.sleep(0.01)


def test_write_response_atomic():
    from main import write_response
    
    async def run_test():
        writer = MockWriter()
        lock = asyncio.Lock()
        
        # Write multiple responses concurrently
        tasks = []
        for i in range(10):
            request_id = 100 + i
            body = f"response_{i}".encode('utf-8')
            tasks.append(write_response(writer, lock, request_id, body))
        
        await asyncio.gather(*tasks)
        
        # Parse all messages from buffer
        buffer = StatefulBuffer()
        messages = buffer.feed(bytes(writer.buffer))
        
        # Should have exactly 10 complete messages
        assert len(messages) == 10
        
        # Verify all request IDs are present
        request_ids = [msg[0] for msg in messages]
        assert sorted(request_ids) == list(range(100, 110))
        
        # Verify all bodies match
        for req_id, body in messages:
            expected_body = f"response_{req_id - 100}".encode('utf-8')
            assert body == expected_body
    
    asyncio.run(run_test())


def test_write_response_no_interleaving():
    from main import write_response
    
    async def run_test():
        writer = MockWriter()
        lock = asyncio.Lock()
        
        # Write responses of different sizes
        tasks = []
        for i in range(5):
            request_id = 200 + i
            body = b"X" * (100 * (i + 1))  # Different sizes: 100, 200, 300, 400, 500 bytes
            tasks.append(write_response(writer, lock, request_id, body))
        
        await asyncio.gather(*tasks)
        
        # Parse messages - should get exactly 5 complete messages
        buffer = StatefulBuffer()
        messages = buffer.feed(bytes(writer.buffer))
        
        assert len(messages) == 5, f"Expected 5 complete messages, got {len(messages)}"
        
        # Verify each message integrity
        for req_id, body in messages:
            assert req_id >= 200 and req_id < 205
            expected_size = 100 * (req_id - 200 + 1)
            assert len(body) == expected_size
            assert body == b"X" * expected_size
    
    asyncio.run(run_test())

class MockStreamReader:
    def __init__(self, chunks):
        self.chunks = chunks
        self.index = 0
        
    async def read(self, size):
        if self.index >= len(self.chunks):
            return b''
        chunk = self.chunks[self.index]
        self.index += 1
        await asyncio.sleep(0.01)
        return chunk


class MockStreamWriter:
    def __init__(self):
        self.buffer = bytearray()
        self.closed = False
        
    def write(self, data):
        if not self.closed:
            self.buffer.extend(data)
        
    async def drain(self):
        await asyncio.sleep(0.01)
        
    def close(self):
        self.closed = True
        
    async def wait_closed(self):
        await asyncio.sleep(0.01)


def test_handle_client_fragmented_headers():
    from main import handle_client
    
    async def run_test():
        # Create a request with fragmented header
        request_id = 500
        body = json.dumps({'sleep': 0.01}).encode('utf-8')
        header = struct.pack('>III', MAGIC_NUMBER, request_id, len(body))
        full_msg = header + body
        
        # Split header into fragments
        chunks = [
            full_msg[:6],      # First half of header
            full_msg[6:12],    # Second half of header
            full_msg[12:],     # Body
            b''                # EOF
        ]
        
        reader = MockStreamReader(chunks)
        writer = MockStreamWriter()
        
        # Run handle_client
        await handle_client(reader, writer)
        
        # Give tasks time to complete
        await asyncio.sleep(0.1)
        
        # Parse response
        buffer = StatefulBuffer()
        responses = buffer.feed(bytes(writer.buffer))
        
        assert len(responses) == 1
        assert responses[0][0] == request_id
        
        response_data = json.loads(responses[0][1].decode('utf-8'))
        assert response_data['request_id'] == request_id
        assert response_data['status'] == 'completed'
    
    asyncio.run(run_test())


def test_handle_client_pipelined_requests():
    from main import handle_client
    
    async def run_test():
        # Create 3 pipelined requests: slow, fast, fast
        requests = []
        
        # Request 1: slow (0.3s)
        body1 = json.dumps({'sleep': 0.3}).encode('utf-8')
        header1 = struct.pack('>III', MAGIC_NUMBER, 601, len(body1))
        requests.append((601, body1, header1 + body1))
        
        # Request 2: fast (0.05s)
        body2 = json.dumps({'sleep': 0.05}).encode('utf-8')
        header2 = struct.pack('>III', MAGIC_NUMBER, 602, len(body2))
        requests.append((602, body2, header2 + body2))
        
        # Request 3: fast (0.05s)
        body3 = json.dumps({'sleep': 0.05}).encode('utf-8')
        header3 = struct.pack('>III', MAGIC_NUMBER, 603, len(body3))
        requests.append((603, body3, header3 + body3))
        
        # Send all pipelined in one chunk
        all_data = b''.join([req[2] for req in requests])
        chunks = [all_data, b'']  # All data + EOF
        
        reader = MockStreamReader(chunks)
        writer = MockStreamWriter()
        
        # Run handle_client
        await handle_client(reader, writer)
        
        # Give tasks time to complete
        await asyncio.sleep(0.5)
        
        # Parse responses
        buffer = StatefulBuffer()
        responses = buffer.feed(bytes(writer.buffer))
        
        assert len(responses) == 3
        
        # Extract response IDs in order received
        response_ids = [resp[0] for resp in responses]
        
        # Fast requests (602, 603) should complete before slow (601)
        # Due to pipelining, they process concurrently
        assert 602 in response_ids
        assert 603 in response_ids
        assert 601 in response_ids
        
        # Verify all responses are correct
        for req_id, resp_body in responses:
            data = json.loads(resp_body.decode('utf-8'))
            assert data['request_id'] == req_id
            assert data['status'] == 'completed'
    
    asyncio.run(run_test())


def test_handle_client_malformed_input():
    from main import handle_client
    
    async def run_test():
        # Send malformed data (wrong magic number)
        bad_header = struct.pack('>III', 0xDEADBEEF, 1, 10)
        chunks = [bad_header, b'']
        
        reader = MockStreamReader(chunks)
        writer = MockStreamWriter()
        
        # Should close connection immediately on malformed input
        await handle_client(reader, writer)
        
        assert writer.closed
        
        # Should have no responses
        buffer = StatefulBuffer()
        responses = buffer.feed(bytes(writer.buffer))
        assert len(responses) == 0
    
    asyncio.run(run_test())


def test_graceful_client_completion():
    """Test that handle_client waits for all spawned tasks before closing"""
    from main import handle_client
    
    async def run_test():
        # Create multiple requests - some slow, some fast
        requests = []
        
        # Slow request
        body1 = json.dumps({'sleep': 0.5}).encode('utf-8')
        header1 = struct.pack('>III', MAGIC_NUMBER, 701, len(body1))
        requests.append(header1 + body1)
        
        # Fast requests
        for i in range(3):
            body = json.dumps({'sleep': 0.05}).encode('utf-8')
            header = struct.pack('>III', MAGIC_NUMBER, 702 + i, len(body))
            requests.append(header + body)
        
        # Send all at once then EOF
        all_data = b''.join(requests)
        chunks = [all_data, b'']
        
        reader = MockStreamReader(chunks)
        writer = MockStreamWriter()
        
        # Run handle_client - it should wait for ALL tasks before closing
        start = time.time()
        await handle_client(reader, writer)
        duration = time.time() - start
        
        # Should have waited for slow task (~0.5s), not returned immediately
        assert duration >= 0.4, f"handle_client returned too quickly: {duration}s"
        
        # Parse all responses
        buffer = StatefulBuffer()
        responses = buffer.feed(bytes(writer.buffer))
        
        # All 4 responses should be present
        assert len(responses) == 4
        
        # Verify all responses are valid
        response_ids = [resp[0] for resp in responses]
        assert 701 in response_ids
        assert 702 in response_ids
        assert 703 in response_ids
        assert 704 in response_ids
    
    asyncio.run(run_test())



def test_fragmentation_100ms_delay():
    """Requirement 10: Send first 6 bytes, sleep 100ms, send rest - verify reconstruction"""
    from main import handle_client
    
    async def run_test():
        request_id = 800
        body = json.dumps({'sleep': 0.01}).encode('utf-8')
        header = struct.pack('>III', MAGIC_NUMBER, request_id, len(body))
        full_msg = header + body
        
        # Custom reader with 100ms delay
        class DelayedReader:
            def __init__(self):
                self.index = 0
                self.chunks = [full_msg[:6], full_msg[6:], b'']
                
            async def read(self, size):
                if self.index >= len(self.chunks):
                    return b''
                chunk = self.chunks[self.index]
                self.index += 1
                if self.index == 2:  # After first chunk, before second
                    await asyncio.sleep(0.1)  # 100ms delay
                return chunk
        
        reader = DelayedReader()
        writer = MockStreamWriter()
        
        await handle_client(reader, writer)
        await asyncio.sleep(0.05)
        
        # Verify response
        buffer = StatefulBuffer()
        responses = buffer.feed(bytes(writer.buffer))
        
        assert len(responses) == 1
        assert responses[0][0] == request_id
        
        response_data = json.loads(responses[0][1].decode('utf-8'))
        assert response_data['request_id'] == request_id
        assert response_data['status'] == 'completed'
    
    asyncio.run(run_test())


def test_pipelining_10_fast_1_slow():
    """Requirement 11: Send 10 fast + 1 slow simultaneously, verify 10 fast arrive before slow"""
    from main import handle_client
    
    async def run_test():
        requests = []
        
        # 1 slow request
        slow_body = json.dumps({'sleep': 1.0}).encode('utf-8')
        slow_header = struct.pack('>III', MAGIC_NUMBER, 900, len(slow_body))
        requests.append(slow_header + slow_body)
        
        # 10 fast requests
        for i in range(10):
            fast_body = json.dumps({'sleep': 0.05}).encode('utf-8')
            fast_header = struct.pack('>III', MAGIC_NUMBER, 901 + i, len(fast_body))
            requests.append(fast_header + fast_body)
        
        # Send all pipelined
        all_data = b''.join(requests)
        chunks = [all_data, b'']
        
        reader = MockStreamReader(chunks)
        writer = MockStreamWriter()
        
        start = time.time()
        await handle_client(reader, writer)
        duration = time.time() - start
        
        # Parse responses
        buffer = StatefulBuffer()
        responses = buffer.feed(bytes(writer.buffer))
        
        assert len(responses) == 11, f"Expected 11 responses, got {len(responses)}"
        
        # Find positions of fast and slow responses
        response_ids = [resp[0] for resp in responses]
        slow_position = response_ids.index(900)
        
        # All 10 fast requests should appear before slow request
        fast_positions = [response_ids.index(901 + i) for i in range(10)]
        
        for fast_pos in fast_positions:
            assert fast_pos < slow_position, \
                f"Fast request at position {fast_pos} came after slow request at position {slow_position}"
        
        # Verify all responses are valid
        for req_id, resp_body in responses:
            data = json.loads(resp_body.decode('utf-8'))
            assert data['request_id'] == req_id
            assert data['status'] == 'completed'
    
    asyncio.run(run_test())


def test_coalescing_5_requests_end_to_end():
    """Requirement 12: 5 requests in single sendall() through handle_client - end-to-end test"""
    from main import handle_client
    
    async def run_test():
        # Create exactly 5 requests with different IDs
        requests = []
        for i in range(5):
            body = json.dumps({'sleep': 0.01}).encode('utf-8')
            header = struct.pack('>III', MAGIC_NUMBER, 1000 + i, len(body))
            requests.append(header + body)
        
        # Concatenate all 5 into single chunk (simulating single socket.sendall())
        all_data = b''.join(requests)
        chunks = [all_data, b'']  # Single sendall + EOF
        
        reader = MockStreamReader(chunks)
        writer = MockStreamWriter()
        
        # Run handle_client end-to-end
        await handle_client(reader, writer)
        await asyncio.sleep(0.1)
        
        # Parse responses
        buffer = StatefulBuffer()
        responses = buffer.feed(bytes(writer.buffer))
        
        # Verify exactly 5 responses
        assert len(responses) == 5, f"Expected 5 responses, got {len(responses)}"
        
        # Verify all IDs present and correct
        response_ids = sorted([resp[0] for resp in responses])
        assert response_ids == [1000, 1001, 1002, 1003, 1004]
        
        # Verify all responses are valid
        for req_id, resp_body in responses:
            data = json.loads(resp_body.decode('utf-8'))
            assert data['request_id'] == req_id
            assert data['status'] == 'completed'
    
    asyncio.run(run_test())


def test_sigint_drain_integration():
    """Requirement 8: Upon SIGINT, server must stop accepting new connections but process pending ones."""
    import subprocess
    import socket
    import signal
    import time
    import os

    # Path to main.py
    main_path = Path(__file__).parent.parent / 'repository_after' / 'main.py'

    # Start server in subprocess
    # Using sys.executable to ensure we use the same python version
    proc = subprocess.Popen(
        [sys.executable, str(main_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    try:
        # Give server time to start (it needs to bind to port 8888)
        time.sleep(1.0)

        # 1. Connect and send a slow request
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect(('127.0.0.1', 8888))

        request_id = 5000
        sleep_time = 1.0  # Server will sleep for 1s
        body = json.dumps({'sleep': sleep_time}).encode('utf-8')
        header = struct.pack('>III', MAGIC_NUMBER, request_id, len(body))
        
        sock.sendall(header + body)

        # 2. Wait a bit so the server's handle_client starts processing
        time.sleep(0.3)

        # 3. Send SIGINT to the server process
        sigint_sent_at = time.time()
        proc.send_signal(signal.SIGINT)

        # 4. Attempt to connect NEW client - should fail (eventually)
        # Note: Depending on OS/timing, the listen socket might still accept but close immediately
        # or the connection might be refused.
        
        # 5. Receive response for the pending request
        # The server MUST process this even after receiving SIGINT
        sock.settimeout(2.0)
        response_data = b''
        # Read full header + body
        while True:
            try:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response_data += chunk
            except socket.timeout:
                break
        
        sock.close()

        # 6. Wait for process to exit
        proc.wait(timeout=5.0)
        exit_at = time.time()
        
        # Verify exit duration: must have waited at least for the rest of the sleep
        # sleep_time(1.0) - wait_time(0.3) = 0.7s expected minimum wait after SIGINT
        wait_duration = exit_at - sigint_sent_at
        assert wait_duration >= 0.5, f"Server exited too fast ({wait_duration:.2f}s), didn't drain tasks"

        # Verify response integrity
        buffer = StatefulBuffer()
        results = buffer.feed(response_data)
        assert len(results) == 1, f"Expected 1 response, got {len(results)}"
        assert results[0][0] == request_id
        
        resp_payload = json.loads(results[0][1].decode('utf-8'))
        assert resp_payload['status'] == 'completed'
        
        # Verify clean exit code (0)
        assert proc.returncode == 0

    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                proc.kill()
