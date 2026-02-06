"""
Tests for the image processor.
"""
import pytest
import tempfile
import os
from PIL import Image
from io import BytesIO

from app.services.processor import ImageProcessor


def create_test_image(format_name='PNG', size=(500, 400), hue=0):
    """Create a test image and return its bytes."""
    img = Image.new('RGB', size, color=(hue % 256, (hue * 2) % 256, (hue * 3) % 256))
    buffer = BytesIO()
    img.save(buffer, format=format_name)
    return buffer.getvalue()


class TestImageProcessor:
    """Tests for ImageProcessor class."""
    
    @pytest.fixture
    def processor(self):
        """Create a processor with temp output directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            proc = ImageProcessor(output_dir=tmpdir)
            yield proc
            proc.cleanup()
    
    def test_process_single_image(self, processor):
        """Test processing a single image."""
        image_data = create_test_image()
        image_id = "test_image_001"
        
        result = processor.process_image(image_data, image_id)
        
        assert result['id'] == image_id
        assert result['status'] == 'success'
        assert 'outputs' in result
        
        # Check outputs exist
        outputs = result['outputs']
        assert 'small_jpeg' in outputs
        assert 'small_webp' in outputs
        assert 'medium_jpeg' in outputs
        assert 'medium_webp' in outputs
        assert 'large_jpeg' in outputs
        assert 'large_webp' in outputs
        
        # Check files exist
        for path in outputs.values():
            assert os.path.exists(path)
    
    def test_process_invalid_image(self, processor):
        """Test processing invalid image data."""
        invalid_data = b"not an image"
        image_id = "test_invalid"
        
        result = processor.process_image(invalid_data, image_id)
        
        assert result['id'] == image_id
        assert result['status'] == 'failed'
        assert 'error' in result
    
    def test_process_duplicate_image(self, processor):
        """Test duplicate detection."""
        image_data = create_test_image()
        image_id1 = "test_duplicate_1"
        image_id2 = "test_duplicate_2"
        
        # Process same image twice
        result1 = processor.process_image(image_data, image_id1, skip_duplicate=True)
        result2 = processor.process_image(image_data, image_id2, skip_duplicate=True)
        
        assert result1['status'] == 'success'
        assert result2['status'] == 'duplicate'
    
    def test_process_without_duplicate_check(self, processor):
        """Test processing without duplicate checking."""
        image_data = create_test_image()
        image_id1 = "test_no_dup_1"
        image_id2 = "test_no_dup_2"
        
        # Process same image twice without duplicate check
        result1 = processor.process_image(image_data, image_id1, skip_duplicate=False)
        result2 = processor.process_image(image_data, image_id2, skip_duplicate=False)
        
        assert result1['status'] == 'success'
        assert result2['status'] == 'success'
    
    def test_process_different_images(self, processor):
        """Test processing different images."""
        img1_data = create_test_image(size=(200, 300))
        img2_data = create_test_image(size=(300, 200))
        
        result1 = processor.process_image(img1_data, "diff_img_1")
        result2 = processor.process_image(img2_data, "diff_img_2")
        
        assert result1['status'] == 'success'
        assert result2['status'] == 'success'
    
    def test_process_rgba_image(self, processor):
        """Test processing RGBA image (transparency)."""
        img = Image.new('RGBA', (300, 300), (255, 0, 0, 128))
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        rgba_data = buffer.getvalue()
        
        result = processor.process_image(rgba_data, "rgba_test")
        
        assert result['status'] == 'success'
        
        # JPEG should be created with white background
        jpeg_path = result['outputs']['medium_jpeg']
        assert os.path.exists(jpeg_path)
        
        # Verify JPEG is RGB mode
        with Image.open(jpeg_path) as jpeg_img:
            assert jpeg_img.mode == 'RGB'
    
    def test_process_different_formats(self, processor):
        """Test processing different input formats."""
        # Test JPEG and PNG formats
        for i, fmt in enumerate(['JPEG', 'PNG']):
            # Use unique hue to avoid duplicate detection
            img_data = create_test_image(format_name=fmt, hue=i)
            result = processor.process_image(img_data, f"format_test_{fmt}")
            assert result['status'] == 'success'
    
    def test_batch_processing(self, processor):
        """Test batch processing with multiple images."""
        images = []
        for i in range(5):
            # Use unique images to avoid duplicate detection
            img_data = create_test_image(size=(100, 100), hue=i * 10)
            images.append({
                "id": f"batch_img_{i}",
                "content": img_data
            })
        
        results = processor.process_batch(images)
        
        assert len(results) == 5
        
        # All should succeed
        for result in results:
            assert result['status'] == 'success'
            assert 'outputs' in result
    
    def test_batch_with_failures(self, processor):
        """Test batch processing handles failures gracefully."""
        # Use unique images
        valid_img1 = create_test_image(hue=100)
        valid_img2 = create_test_image(hue=200)
        
        images = [
            {"id": "valid_1", "content": valid_img1},
            {"id": "invalid", "content": b"not valid"},
            {"id": "valid_2", "content": valid_img2},
        ]
        
        results = processor.process_batch(images)
        
        assert len(results) == 3
        
        # Check that failures don't stop other processing
        statuses = [r['status'] for r in results]
        assert 'success' in statuses
        assert 'failed' in statuses


class TestImageProcessorOutputDirectory:
    """Tests for output directory handling."""
    
    def test_custom_output_directory(self):
        """Test processor uses custom output directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            proc = ImageProcessor(output_dir=tmpdir)
            img_data = create_test_image()
            
            result = proc.process_image(img_data, "output_test")
            
            assert result['status'] == 'success'
            assert tmpdir in result['outputs']['small_jpeg']
    
    def test_get_output_dir(self):
        """Test getting output directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            proc = ImageProcessor(output_dir=tmpdir)
            assert proc.get_output_dir() == tmpdir
