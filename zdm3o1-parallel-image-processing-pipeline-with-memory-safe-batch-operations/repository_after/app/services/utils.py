"""
Utility functions for hash computation with chunked reading for large files.
"""
import hashlib
from typing import Union

# Magic bytes for image format detection
IMAGE_MAGIC_BYTES = {
    b'\xff\xd8\xff': 'JPEG',  # JPEG can start with various FF D8 FF combinations
    b'\x89PNG\r\n\x1a\n': 'PNG',
    b'GIF87a': 'GIF',
    b'GIF89a': 'GIF',
    b'II\x2a\x00': 'TIFF',
    b'MM\x00\x2a': 'TIFF',
    b'BM': 'BMP',
    b'RIFF': 'WEBP',  # RIFF header for WebP
}

# JPEG markers
JPEG_START = b'\xff\xd8'
JPEG_MARKERS = [b'\xff\xe0', b'\xff\xe1', b'\xff\xdb', b'\xff\xee']  # APP0, APP1, DQT, APP14


def compute_sha256_chunked(file_data: Union[bytes, str]) -> str:
    """
    Compute SHA-256 hash using chunked reading to handle large files.
    
    Args:
        file_data: Either bytes content or path to a file
        
    Returns:
        Hexadecimal string of the SHA-256 hash
    """
    sha256_hash = hashlib.sha256()
    
    if isinstance(file_data, str):
        # It's a file path, read in chunks
        with open(file_data, 'rb') as f:
            while True:
                chunk = f.read(8192)
                if not chunk:
                    break
                sha256_hash.update(chunk)
    else:
        # It's bytes data, compute directly (chunked for very large data)
        if len(file_data) > 100 * 1024 * 1024:  # > 100MB, process in chunks
            for i in range(0, len(file_data), 8192):
                sha256_hash.update(file_data[i:i + 8192])
        else:
            sha256_hash.update(file_data)
    
    return sha256_hash.hexdigest()


def detect_image_format(file_data: bytes) -> str:
    """
    Detect image format from magic bytes.
    
    Args:
        file_data: First few bytes of the image file
        
    Returns:
        Detected format string or 'UNKNOWN'
    """
    if len(file_data) < 2:
        return 'UNKNOWN'
    
    # Get first 2 bytes for basic format check
    first_two = file_data[:2]
    first_three = file_data[:3]
    first_four = file_data[:4]
    
    # JPEG detection: starts with FF D8
    if first_two == b'\xff\xd8':
        return 'JPEG'
    
    # Check for each format's magic bytes
    if first_four == b'\x89PNG':
        return 'PNG'
    if first_three == b'GIF':  # Both GIF87a and GIF89a start with GIF
        return 'GIF'
    if first_four == b'II\x2a' or first_four == b'MM\x00':
        return 'TIFF'
    if first_two == b'BM':
        return 'BMP'
    if first_four == b'RIFF' and len(file_data) >= 12:
        if file_data[8:12] == b'WEBP':
            return 'WEBP'
    
    return 'UNKNOWN'


def validate_image_format(file_data: bytes, allowed_formats: list = None) -> tuple:
    """
    Validate image format against allowed formats.
    
    Args:
        file_data: Image file bytes
        allowed_formats: List of allowed format strings
        
    Returns:
        Tuple of (is_valid: bool, detected_format: str, error_message: str)
    """
    if allowed_formats is None:
        allowed_formats = ['PNG', 'JPEG', 'GIF', 'TIFF', 'BMP', 'WEBP']
    
    detected = detect_image_format(file_data)
    
    if detected == 'UNKNOWN':
        return False, 'UNKNOWN', 'Unable to detect image format. File may be corrupted or unsupported.'
    
    if detected not in allowed_formats:
        return False, detected, f"Format '{detected}' is not in allowed formats: {allowed_formats}"
    
    return True, detected, None
