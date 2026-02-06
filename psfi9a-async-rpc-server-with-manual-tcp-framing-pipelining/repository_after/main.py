import struct
import asyncio
import json

MAGIC_NUMBER = 0xC0DEBABE
HEADER_SIZE = 12


def parse_header(buffer: bytes) -> tuple[int, int]:
    if len(buffer) < HEADER_SIZE:
        raise ValueError(f"Buffer too small: expected {HEADER_SIZE} bytes, got {len(buffer)}")
    
    magic, request_id, body_length = struct.unpack('>III', buffer[:HEADER_SIZE])
    
    if magic != MAGIC_NUMBER:
        raise ValueError(f"Invalid magic number: expected {MAGIC_NUMBER:#x}, got {magic:#x}")
    
    return request_id, body_length


class StatefulBuffer:
    def __init__(self):
        self._buffer = b""

    def feed(self, data: bytes) -> list[tuple[int, bytes]]:
        self._buffer += data
        requests = []
        
        while len(self._buffer) >= HEADER_SIZE:
            # Check header (don't consume yet)
            request_id, body_length = parse_header(self._buffer[:HEADER_SIZE])
            
            total_size = HEADER_SIZE + body_length
            if len(self._buffer) < total_size:
                break
                
            # Extract full message
            body = self._buffer[HEADER_SIZE:total_size]
            requests.append((request_id, body))
            self._buffer = self._buffer[total_size:]
            
        return requests


async def process_request(request_id: int, body: bytes) -> bytes:
    try:
        data = json.loads(body.decode('utf-8'))
        sleep_duration = data.get('sleep', 0.0)
    except (json.JSONDecodeError, KeyError, ValueError):
        sleep_duration = 0.0
    
    await asyncio.sleep(sleep_duration)
    
    result = {
        'request_id': request_id,
        'status': 'completed',
        'slept': sleep_duration
    }
    return json.dumps(result).encode('utf-8')


async def write_response(writer, lock, request_id: int, body: bytes):
    header = struct.pack('>III', MAGIC_NUMBER, request_id, len(body))
    message = header + body
    
    async with lock:
        writer.write(message)
        await writer.drain()


async def handle_client(reader, writer):
    buffer = StatefulBuffer()
    lock = asyncio.Lock()
    tasks = []
    
    try:
        while True:
            data = await reader.read(1024)
            if not data:
                break
            
            try:
                requests = buffer.feed(data)
            except ValueError:
                # Malformed input - close immediately
                break
            
            # Spawn detached tasks for each complete request
            for request_id, body in requests:
                task = asyncio.create_task(
                    handle_request(writer, lock, request_id, body)
                )
                tasks.append(task)
        
        # Wait for all spawned tasks to complete
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        writer.close()
        await writer.wait_closed()


async def handle_request(writer, lock, request_id: int, body: bytes):
    response_body = await process_request(request_id, body)
    await write_response(writer, lock, request_id, response_body)


async def main():
    import signal
    
    shutdown_event = asyncio.Event()
    client_tasks = set()
    
    def signal_handler():
        shutdown_event.set()
    
    loop = asyncio.get_running_loop()
    loop.add_signal_handler(signal.SIGINT, signal_handler)
    
    def wrapped_handle_client(reader, writer):
        task = asyncio.create_task(handle_client(reader, writer))
        client_tasks.add(task)
        task.add_done_callback(client_tasks.discard)
    
    server = await asyncio.start_server(wrapped_handle_client, '0.0.0.0', 8888)
    
    async with server:
        # Serve in background task
        serve_task = asyncio.create_task(server.serve_forever())
        
        # Wait for shutdown signal
        try:
            await shutdown_event.wait()
        finally:
            # Stop accepting new connections
            server.close()
            serve_task.cancel()
            try:
                await serve_task
            except asyncio.CancelledError:
                pass
            
            # Wait for all current client tasks to finish
            if client_tasks:
                await asyncio.gather(*client_tasks, return_exceptions=True)
            
            await server.wait_closed()


if __name__ == '__main__':
    asyncio.run(main())
