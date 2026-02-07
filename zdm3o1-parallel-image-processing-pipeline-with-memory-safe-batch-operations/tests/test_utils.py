"""
Tests for utility functions (hashing and format validation).
"""
import pytest
import tempfile
import os
from PIL import Image
from io import BytesIO

from app.services.utils import (
    compute_sha256_chunked,
    detect_image_format,
    validate_image_format,
)


class TestComputeSHA256:
    """Tests for SHA-256 hash computation."""
    
    def test_compute_hash_bytes(self):
        """Test hashing bytes data."""
        data = b"Hello, World!"
        hash1 = compute_sha256_chunked(data)
        hash2 = compute_sha256_chunked(data)
        
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 hex is 64 chars
        assert hash1.isalnum()
    
    def test_compute_hash_file(self):
        """Test hashing a file."""
        # Create a temp image file
        img = Image.new('RGB', (100, 100), color='red')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        data = buffer.getvalue()
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as f:
            f.write(data)
            temp_path = f.name
        
        try:
            hash_from_file = compute_sha256_chunked(temp_path)
            hash_from_bytes = compute_sha256_chunked(data)
            
            assert hash_from_file == hash_from_bytes
        finally:
            os.remove(temp_path)
    
    def test_different_data_different_hash(self):
        """Test that different data produces different hashes."""
        hash1 = compute_sha256_chunked(b"data1")
        hash2 = compute_sha256_chunked(b"data2")
        
        assert hash1 != hash2


class TestDetectImageFormat:
    """Tests for image format detection via magic bytes."""
    
    def test_detect_jpeg(self):
        """Test JPEG format detection."""
        # JPEG magic bytes: FF D8 FF
        jpeg_data = b'\xff\xd8\xff\xe0\x00\x10JFIF'
        format_detected = detect_image_format(jpeg_data)
        
        assert format_detected == 'JPEG'
    
    def test_detect_png(self):
        """Test PNG format detection."""
        # PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
        format_detected = detect_image_format(png_data)
        
        assert format_detected == 'PNG'
    
    def test_detect_gif(self):
        """Test GIF format detection."""
        # GIF89a magic bytes
        gif_data = b'GIF89a\x01\x00\x01\x00\x80\x00\x00'
        format_detected = detect_image_format(gif_data)
        
        assert format_detected == 'GIF'
    
    def test_detect_bmp(self):
        """Test BMP format detection."""
        # BMP magic bytes: 42 4D (BM)
        bmp_data = b'BM\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
        format_detected = detect_image_format(bmp_data)
        
        assert format_detected == 'BMP'
    
    def test_detect_unknown(self):
        """Test unknown format detection."""
        unknown_data = b'not an image format!!!'
        format_detected = detect_image_format(unknown_data)
        
        assert format_detected == 'UNKNOWN'
    
    def test_detect_short_data(self):
        """Test detection with insufficient data."""
        # Single byte is not enough to identify any format
        short_data = b'\xff'
        format_detected = detect_image_format(short_data)
        
        assert format_detected == 'UNKNOWN'


class TestValidateImageFormat:
    """Tests for image format validation."""
    
    def test_validate_valid_jpeg(self):
        """Test validation of valid JPEG."""
        jpeg_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00'
        is_valid, fmt, error = validate_image_format(jpeg_data)
        
        assert is_valid is True
        assert fmt == 'JPEG'
        assert error is None
    
    def test_validate_invalid_format(self):
        """Test validation rejects invalid format."""
        invalid_data = b'this is not an image'
        is_valid, fmt, error = validate_image_format(invalid_data)
        
        assert is_valid is False
        assert fmt == 'UNKNOWN'
        assert error is not None
    
    def test_validate_with_allowed_formats(self):
        """Test validation with custom allowed formats."""
        jpeg_data = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00'
        is_valid, fmt, error = validate_image_format(
            jpeg_data, 
            allowed_formats=['PNG', 'GIF']
        )
        
        assert is_valid is False
        assert error is not None
        assert 'not in allowed formats' in error
