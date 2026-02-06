"""
Robust Stream Reassembly with Incremental Decoding

A low-level log reassembly engine that processes raw byte streams from a remote deployment agent.
Handles arbitrary chunk boundaries, including split JSON lines and multi-byte UTF-8 characters.
"""

import json
import codecs
from typing import Generator, Optional, Dict, Any


class StreamProcessor:
    """
    A stateful stream processor that handles partial records and split characters
    across chunk boundaries.
    
    Uses incremental UTF-8 decoding to safely handle multi-byte characters that
    may be split across network chunks.
    """
    
    def __init__(self):
        self._buffer = ""  # Residual incomplete line from previous chunk
        self._decoder = codecs.getincrementaldecoder("utf-8")("replace")  # Incremental UTF-8 decoder
        self._error_counts: Dict[str, int] = {}  # Aggregate errors by service name
    
    def process(self, chunk_generator: Generator[bytes, None, None]) -> Generator[Dict[str, Any], None, None]:
        """
        Process a byte stream generator, yielding complete JSON records.
        
        Args:
            chunk_generator: Generator yielding raw byte chunks
            
        Yields:
            Complete, valid JSON objects from the stream
        """
        self._buffer = ""
        self._error_counts = {}
        
        for chunk in chunk_generator:
            if not chunk:
                continue
            
            # Decode the chunk incrementally - the decoder handles split UTF-8 characters
            # internally and returns complete characters where possible
            decoded_chunk = self._decoder.decode(chunk, final=False)
            
            # Prepend any residual from previous chunk
            combined_data = self._buffer + decoded_chunk
            
            # Split by newlines to get individual lines
            lines = combined_data.split("\n")
            
            # The last element may be incomplete (no newline)
            self._buffer = lines[-1]
            
            # Process all complete lines (all but the last)
            for line in lines[:-1]:
                if line.strip():
                    record = self._parse_and_track(line)
                    if record is not None:
                        yield record
        
        # Handle any remaining data in buffer after stream ends
        if self._buffer.strip():
            record = self._parse_and_track(self._buffer)
            if record is not None:
                yield record
        
        # Flush the decoder to get any remaining buffered data
        final_data = self._decoder.decode(b"", final=True)
        if final_data.strip():
            record = self._parse_and_track(final_data)
            if record is not None:
                yield record
    
    def _parse_and_track(self, line: str) -> Optional[Dict[str, Any]]:
        """
        Parse a line as JSON and track errors by service name.
        
        Args:
            line: A single line of text to parse
            
        Returns:
            Parsed JSON object or None if parsing fails
        """
        try:
            record = json.loads(line)
            return record
        except json.JSONDecodeError as e:
            # Extract service name for error aggregation
            service_name = self._extract_service_name(line)
            self._error_counts[service_name] = self._error_counts.get(service_name, 0) + 1
            return None
    
    def _extract_service_name(self, line: str) -> str:
        """
        Attempt to extract service name from a malformed line.
        
        Args:
            line: The line that failed to parse
            
        Returns:
            Service name or "unknown" if not found
        """
        # Try to parse partial JSON to find service name
        try:
            # Look for "service" or "Service Name" key
            for key in ['"service"', '"Service Name"', '"service_name"']:
                idx = line.find(key)
                if idx != -1:
                    # Try to extract the value after the key
                    start = line.find(":", idx)
                    if start != -1:
                        # Find the value
                        value_start = start + 1
                        # Skip whitespace
                        while value_start < len(line) and line[value_start] in ' \t':
                            value_start += 1
                        if value_start < len(line):
                            # Extract string value
                            if line[value_start] == '"':
                                value_end = line.find('"', value_start + 1)
                                if value_end != -1:
                                    return line[value_start + 1:value_end]
        except Exception:
            pass
        
        return "unknown"
    
    def get_error_report(self) -> Dict[str, int]:
        """
        Get the final error aggregation report.
        
        Returns:
            Dictionary mapping service names to error counts
        """
        return self._error_counts.copy()
    
    def print_error_report(self) -> None:
        """Print the final error aggregation report."""
        if self._error_counts:
            print("\n=== Error Aggregation Report ===")
            for service, count in sorted(self._error_counts.items()):
                print(f"  {service}: {count} errors")
            print("================================\n")
        else:
            print("\n=== No errors detected ===\n")


def create_chunk_generator(data: bytes, chunk_size: int = 1024) -> Generator[bytes, None, None]:
    """
    Utility function to simulate a byte stream generator.
    
    Args:
        data: Full byte data to chunk
        chunk_size: Size of each chunk
        
    Yields:
        Chunks of bytes
    """
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]


def process_byte_stream(stream_data: bytes, chunk_size: int = 1024) -> None:
    """
    Process byte stream data and print error report.
    
    Args:
        stream_data: Raw byte data containing JSON log lines
        chunk_size: Size of chunks to simulate
    """
    processor = StreamProcessor()
    
    # Create chunk generator
    chunk_gen = create_chunk_generator(stream_data, chunk_size)
    
    # Process and count records
    record_count = 0
    for record in processor.process(chunk_gen):
        record_count += 1
        # Process each record (in a real scenario, you'd do something with it)
        print(f"Processed record: {record.get('service', 'unknown')}")
    
    # Print error report
    processor.print_error_report()
    
    print(f"Total records processed: {record_count}")


# Example usage and testing
if __name__ == "__main__":
    # Sample data with various edge cases
    sample_logs = [
        '{"service": "auth", "message": "Login successful", "level": "info"}\n',
        '{"service": "db", "message": "Connection established", "level": "info"}\n',
        '{"service": "auth", "message": "Invalid password", "level": "error"}\n',
        '{"service": "auth", "message": "🔐 Security event", "level": "warning"}\n',  # Emoji
        '{"service": "api", "message": "Request timeout", "level": "error"}\n',
        '{"service": "db", "message": "Slow query: 您好世界", "level": "warning"}\n',  # Kanji
        'invalid json line\n',  # Malformed
        '{"incomplete": "json',  # Truncated
        '\n{"service": "cache", "message": "Cache cleared", "level": "info"}\n',
    ]
    
    # Join and encode
    full_data = "".join(sample_logs).encode("utf-8")
    
    # Process with various chunk sizes to test boundary handling
    print("Testing with chunk_size=50 (forces many splits):")
    print("-" * 50)
    process_byte_stream(full_data, chunk_size=50)
    
    print("\n" + "=" * 60 + "\n")
    
    print("Testing with chunk_size=256:")
    print("-" * 50)
    process_byte_stream(full_data, chunk_size=256)
