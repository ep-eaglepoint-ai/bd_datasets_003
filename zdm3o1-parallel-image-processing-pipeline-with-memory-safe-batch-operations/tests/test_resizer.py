"""
Tests for image resizing functions.
"""
import pytest
from PIL import Image
from io import BytesIO

from app.services.resizer import (
    resize_preserve_aspect_ratio,
    resize_to_exact_size,
    resize_thumbnail,
)


class TestResizePreserveAspectRatio:
    """Tests for aspect ratio preserving resize."""
    
    def test_resize_landscape_image(self):
        """Test resizing a landscape image."""
        # 800x600 image
        img = Image.new('RGB', (800, 600), color='blue')
        
        resized = resize_preserve_aspect_ratio(img, 400, 400)
        
        # Should fit within 400x400
        assert resized.width <= 400
        assert resized.height <= 400
        
        # Aspect ratio should be preserved (approximately 4:3)
        original_ratio = 800 / 600  # 1.333
        new_ratio = resized.width / resized.height
        assert abs(original_ratio - new_ratio) < 0.01
    
    def test_resize_portrait_image(self):
        """Test resizing a portrait image."""
        # 600x800 image
        img = Image.new('RGB', (600, 800), color='green')
        
        resized = resize_preserve_aspect_ratio(img, 400, 400)
        
        # Should fit within 400x400
        assert resized.width <= 400
        assert resized.height <= 400
        
        # Aspect ratio should be preserved (approximately 3:4)
        original_ratio = 600 / 800  # 0.75
        new_ratio = resized.width / resized.height
        assert abs(original_ratio - new_ratio) < 0.01
    
    def test_resize_square_image(self):
        """Test resizing a square image."""
        img = Image.new('RGB', (500, 500), color='red')
        
        resized = resize_preserve_aspect_ratio(img, 400, 300)
        
        # Should fit within bounds
        assert resized.width <= 400
        assert resized.height <= 300
        
        # Aspect ratio should be preserved (1:1)
        assert resized.width == resized.height
    
    def test_resize_already_small_image(self):
        """Test resizing an image smaller than target."""
        img = Image.new('RGB', (100, 100), color='yellow')
        
        resized = resize_preserve_aspect_ratio(img, 400, 400)
        
        # Should not upscale
        assert resized.width == 100
        assert resized.height == 100
    
    def test_resize_to_larger_bounds(self):
        """Test resizing with bounds larger than image."""
        img = Image.new('RGB', (200, 300), color='purple')
        
        resized = resize_preserve_aspect_ratio(img, 800, 800)
        
        # Should not upscale
        assert resized.width == 200
        assert resized.height == 300


class TestResizeToExactSize:
    """Tests for exact size resize with padding."""
    
    def test_resize_to_exact_with_padding(self):
        """Test resize adds padding when needed."""
        # 800x600 landscape
        img = Image.new('RGB', (800, 600), color='blue')
        
        resized = resize_to_exact_size(img, 500, 500)
        
        # Should be exactly 500x500
        assert resized.width == 500
        assert resized.height == 500
    
    def test_resize_to_exact_no_padding(self):
        """Test resize without padding when aspect ratio matches."""
        # 500x500 square
        img = Image.new('RGB', (500, 500), color='green')
        
        resized = resize_to_exact_size(img, 500, 500)
        
        assert resized.width == 500
        assert resized.height == 500
    
    def test_resize_custom_fill_color(self):
        """Test resize with custom fill color."""
        img = Image.new('RGB', (100, 200), color='red')
        
        resized = resize_to_exact_size(img, 300, 300, fill_color=(0, 0, 0))
        
        # Background should be black
        assert resized.getpixel((0, 0)) == (0, 0, 0)


class TestResizeThumbnail:
    """Tests for thumbnail resize convenience function."""
    
    def test_thumbnail_creation(self):
        """Test thumbnail creation."""
        img = Image.new('RGB', (1000, 800), color='cyan')
        
        thumb = resize_thumbnail(img, (200, 200))
        
        # Should fit within bounds
        assert thumb.width <= 200
        assert thumb.height <= 200
        
        # Should preserve aspect ratio
        original_ratio = 1000 / 800
        new_ratio = thumb.width / thumb.height
        assert abs(original_ratio - new_ratio) < 0.01
