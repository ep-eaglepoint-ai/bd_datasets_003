"""
Tests for image optimization functions.
"""
import pytest
from PIL import Image
from io import BytesIO

from app.services.optimizer import (
    create_white_background,
    optimize_jpeg,
    optimize_webp,
    optimize_for_web,
    metrics,
)


class TestCreateWhiteBackground:
    """Tests for white background compositing."""
    
    def test_convert_rgba_to_rgb(self):
        """Test converting RGBA to RGB with white background."""
        # Create RGBA image with transparency
        img = Image.new('RGBA', (100, 100), (0, 0, 0, 128))
        
        rgb_img = create_white_background(img)
        
        # Should be RGB mode
        assert rgb_img.mode == 'RGB'
        
        # Should have white background where transparent
        # Center should show the dark color
        assert rgb_img.getpixel((50, 50)) != (255, 255, 255)
    
    def test_convert_rgb_no_change(self):
        """Test RGB image unchanged."""
        img = Image.new('RGB', (100, 100), color='blue')
        
        result = create_white_background(img)
        
        assert result.mode == 'RGB'
        assert result.getpixel((50, 50)) == (0, 0, 255)
    
    def test_convert_grayscale(self):
        """Test grayscale conversion."""
        img = Image.new('L', (100, 100), 128)
        
        result = create_white_background(img)
        
        # Should be converted to RGB
        assert result.mode == 'RGB'
    
    def test_convert_p_mode(self):
        """Test palette mode conversion."""
        img = Image.new('P', (100, 100))
        
        result = create_white_background(img)
        
        assert result.mode == 'RGB'


class TestOptimizeJPEG:
    """Tests for JPEG optimization."""
    
    def test_optimize_rgb_to_jpeg(self):
        """Test optimizing RGB image to JPEG."""
        img = Image.new('RGB', (200, 200), color='red')
        
        jpeg_bytes = optimize_jpeg(img)
        
        # Should return bytes
        assert isinstance(jpeg_bytes, bytes)
        assert len(jpeg_bytes) > 0
        
        # Should be valid JPEG (starts with FFD8)
        assert jpeg_bytes[:2] == b'\xff\xd8'
    
    def test_optimize_rgba_to_jpeg(self):
        """Test optimizing RGBA image to JPEG (should handle transparency)."""
        img = Image.new('RGBA', (200, 200), (0, 255, 0, 128))
        
        jpeg_bytes = optimize_jpeg(img)
        
        # Should return valid JPEG bytes
        assert isinstance(jpeg_bytes, bytes)
        assert len(jpeg_bytes) > 0
        assert jpeg_bytes[:2] == b'\xff\xd8'
    
    def test_optimize_with_quality(self):
        """Test JPEG optimization with custom quality."""
        img = Image.new('RGB', (100, 100), color='blue')
        
        high_quality = optimize_jpeg(img, quality=95)
        low_quality = optimize_jpeg(img, quality=50)
        
        # Higher quality should produce larger file (usually)
        # This is not always true due to compression, but we test it doesn't crash
        assert isinstance(high_quality, bytes)
        assert isinstance(low_quality, bytes)
    
    def test_metrics_recorded(self):
        """Test that metrics are recorded for optimization."""
        # Reset metrics
        metrics.reset()
        
        img = Image.new('RGB', (100, 100), color='green')
        optimize_jpeg(img)
        
        stats = metrics.get_statistics('jpeg_optimize')
        
        assert stats['count'] >= 1
        assert stats['min'] >= 0
        assert stats['max'] >= 0


class TestOptimizeWebP:
    """Tests for WebP optimization."""
    
    def test_optimize_to_webp(self):
        """Test optimizing image to WebP."""
        img = Image.new('RGB', (200, 200), color='yellow')
        
        webp_bytes = optimize_webp(img)
        
        assert isinstance(webp_bytes, bytes)
        assert len(webp_bytes) > 0
    
    def test_optimize_with_quality(self):
        """Test WebP optimization with custom quality."""
        img = Image.new('RGB', (100, 100), color='purple')
        
        high_quality = optimize_webp(img, quality=90)
        low_quality = optimize_webp(img, quality=50)
        
        assert isinstance(high_quality, bytes)
        assert isinstance(low_quality, bytes)
    
    def test_optimize_rgba_to_webp(self):
        """Test RGBA to WebP optimization."""
        img = Image.new('RGBA', (100, 100), (255, 0, 0, 128))
        
        webp_bytes = optimize_webp(img)
        
        assert isinstance(webp_bytes, bytes)


class TestOptimizeForWeb:
    """Tests for web optimization (multiple formats)."""
    
    def test_optimize_for_web_returns_dict(self):
        """Test optimize_for_web returns both formats."""
        img = Image.new('RGB', (200, 200), color='cyan')
        
        result = optimize_for_web(img)
        
        assert isinstance(result, dict)
        assert 'jpeg' in result
        assert 'webp' in result
        assert isinstance(result['jpeg'], bytes)
        assert isinstance(result['webp'], bytes)
    
    def test_optimize_for_web_custom_quality(self):
        """Test optimize_for_web with custom qualities."""
        img = Image.new('RGB', (100, 100), color='magenta')
        
        result = optimize_for_web(img, jpeg_quality=90, webp_quality=90)
        
        assert 'jpeg' in result
        assert 'webp' in result
