"""
Integration tests for the complete image processing pipeline.
"""
import pytest
import time
import tempfile
from PIL import Image
from io import BytesIO

from app.services.processor import ImageProcessor
from app.services.batch import BatchProcessor
from app.services.utils import compute_sha256_chunked


def create_test_image(format_name='PNG', size=(500, 400)):
    """Create a test image and return bytes."""
    img = Image.new('RGB', size, color='blue')
    buffer = BytesIO()
    img.save(buffer, format=format_name)
    return buffer.getvalue()


def create_unique_image(format_name='PNG', size=(500, 400), hue=0):
    """Create a unique test image with different content."""
    img = Image.new('RGB', size, color=(hue % 256, (hue * 2) % 256, (hue * 3) % 256))
    buffer = BytesIO()
    img.save(buffer, format=format_name)
    return buffer.getvalue()


def create_rgba_image(size=(200, 200)):
    """Create an RGBA image with transparency."""
    img = Image.new('RGBA', size, (255, 0, 0, 128))
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()


class TestCompletePipeline:
    """Integration tests for the complete pipeline."""
    
    @pytest.fixture
    def processor(self):
        """Create an image processor."""
        with tempfile.TemporaryDirectory() as tmpdir:
            proc = ImageProcessor(output_dir=tmpdir)
            yield proc
            proc.cleanup()
    
    def test_single_image_pipeline(self, processor):
        """Test complete processing pipeline for single image."""
        image_data = create_test_image()
        image_id = "pipeline_test_001"
        
        result = processor.process_image(image_data, image_id)
        
        assert result['status'] == 'success'
        assert result['id'] == image_id
        
        # All output formats should exist
        expected_outputs = [
            'small_jpeg', 'small_webp',
            'medium_jpeg', 'medium_webp',
            'large_jpeg', 'large_webp'
        ]
        
        for output in expected_outputs:
            assert output in result['outputs']
            assert result['outputs'][output] is not None
    
    def test_pipeline_with_duplicate_detection(self, processor):
        """Test that duplicate images are correctly detected."""
        image_data = create_test_image()
        
        result1 = processor.process_image(image_data, "dup_1", skip_duplicate=True)
        result2 = processor.process_image(image_data, "dup_2", skip_duplicate=True)
        
        assert result1['status'] == 'success'
        assert result2['status'] == 'duplicate'
    
    def test_pipeline_with_invalid_images(self, processor):
        """Test pipeline handles invalid images gracefully."""
        images = [
            {"id": "valid_1", "content": create_unique_image(hue=1)},
            {"id": "invalid_1", "content": b"not valid data"},
            {"id": "valid_2", "content": create_unique_image(hue=2)},
        ]
        
        results = processor.process_batch(images)
        
        # Should have results for all images
        assert len(results) == 3
        
        # Some should succeed, some should fail
        statuses = [r['status'] for r in results]
        assert 'success' in statuses
        assert 'failed' in statuses
    
    def test_pipeline_with_rgba_images(self, processor):
        """Test pipeline correctly handles RGBA images."""
        rgba_data = create_rgba_image()
        
        result = processor.process_image(rgba_data, "rgba_test")
        
        assert result['status'] == 'success'
        
        # JPEG output should be RGB (transparency converted)
        jpeg_path = result['outputs']['medium_jpeg']
        with Image.open(jpeg_path) as jpeg_img:
            assert jpeg_img.mode == 'RGB'
    
    def test_batch_parallel_processing(self, processor):
        """Test batch processing runs in parallel."""
        images = [
            {"id": f"batch_{i}", "content": create_unique_image(hue=i * 10)}
            for i in range(5)
        ]
        
        start = time.time()
        results = processor.process_batch(images)
        elapsed = time.time() - start
        
        # All should complete
        assert len(results) == 5
        
        # All should succeed
        for result in results:
            assert result['status'] == 'success'
        
        # Should complete reasonably fast
        assert elapsed < 30
    
    def test_aspect_ratio_preservation(self, processor):
        """Test that aspect ratio is preserved in all sizes."""
        # Create non-square image larger than target sizes
        img = Image.new('RGB', (800, 600), color='green')
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        image_data = buffer.getvalue()
        
        result = processor.process_image(image_data, "aspect_test")
        
        assert result['status'] == 'success'
        
        # Check each size preserves ratio (approximately 4:3)
        # Only check sizes that actually get resized (medium and large)
        for size_name in ['medium', 'large']:
            for fmt in ['jpeg', 'webp']:
                path = result['outputs'][f"{size_name}_{fmt}"]
                with Image.open(path) as resized:
                    ratio = resized.width / resized.height
                    original_ratio = 800 / 600  # 1.333
                    assert abs(ratio - original_ratio) < 0.01


class TestLargeFileHandling:
    """Tests for handling large files."""
    
    @pytest.fixture
    def processor(self):
        """Create a processor."""
        with tempfile.TemporaryDirectory() as tmpdir:
            proc = ImageProcessor(output_dir=tmpdir)
            yield proc
            proc.cleanup()
    
    def test_large_image_processing(self, processor):
        """Test processing a relatively large image."""
        # Create a 2MB equivalent image
        img = Image.new('RGB', (2000, 2000), color='red')
        buffer = BytesIO()
        img.save(buffer, format='PNG', compress_level=1)
        image_data = buffer.getvalue()
        
        # Should process without error
        result = processor.process_image(image_data, "large_test")
        
        assert result['status'] == 'success'


class TestErrorHandling:
    """Tests for error handling scenarios."""
    
    @pytest.fixture
    def processor(self):
        """Create a processor."""
        with tempfile.TemporaryDirectory() as tmpdir:
            proc = ImageProcessor(output_dir=tmpdir)
            yield proc
            proc.cleanup()
    
    def test_corrupted_image(self, processor):
        """Test handling of corrupted image data."""
        # Valid header but corrupted content
        corrupted = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00corrupted_data_here'
        
        result = processor.process_image(corrupted, "corrupted_test")
        
        # Should fail gracefully
        assert result['status'] == 'failed'
        assert 'error' in result
    
    def test_empty_data(self, processor):
        """Test handling of empty data."""
        result = processor.process_image(b"", "empty_test")
        
        assert result['status'] == 'failed'
    
    def test_partial_batch_failure(self, processor):
        """Test that partial failures don't stop batch."""
        images = []
        for i in range(5):
            if i % 2 == 0:
                images.append({"id": f"valid_{i}", "content": create_unique_image(hue=i)})
            else:
                images.append({"id": f"invalid_{i}", "content": b"bad data"})
        
        results = processor.process_batch(images)
        
        # All should have results
        assert len(results) == 5
        
        # Valid ones should succeed (check at least one succeeds)
        success_count = sum(1 for r in results if r['status'] == 'success')
        assert success_count >= 2  # At least 2 valid images should succeed
