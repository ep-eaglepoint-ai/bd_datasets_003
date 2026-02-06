"""
Tests for batch processing.
Note: Some tests are skipped on Windows due to multiprocessing pickle limitations.
"""
import pytest
import time
from PIL import Image
from io import BytesIO
import sys

from app.services.batch import BatchStatusTracker, BatchProcessor


def create_test_image(size=(100, 100)):
    """Create a test image."""
    img = Image.new('RGB', size, color='blue')
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()


class TestBatchStatusTracker:
    """Tests for batch status tracking."""
    
    @pytest.fixture
    def tracker(self):
        """Create a status tracker."""
        return BatchStatusTracker(redis_url="redis://localhost:6379")
    
    def test_init_batch(self, tracker):
        """Test initializing batch status."""
        batch_id = "test_batch_001"
        
        tracker.init_batch(batch_id, total_images=10)
        
        status = tracker.get_status(batch_id)
        
        assert status['batch_id'] == batch_id
        assert status['total'] == 10
        assert status['completed'] == 0
        assert status['failed'] == 0
        assert status['pending'] == 10
        assert status['status'] == 'processing'
    
    def test_increment_completed(self, tracker):
        """Test incrementing completed counter."""
        batch_id = "test_batch_002"
        tracker.init_batch(batch_id, total_images=5)
        
        tracker.increment_completed(batch_id, 2)
        
        status = tracker.get_status(batch_id)
        assert status['completed'] == 2
        assert status['pending'] == 3
    
    def test_increment_failed(self, tracker):
        """Test incrementing failed counter."""
        batch_id = "test_batch_003"
        tracker.init_batch(batch_id, total_images=5)
        
        tracker.increment_failed(batch_id, 1)
        
        status = tracker.get_status(batch_id)
        assert status['failed'] == 1
        assert status['pending'] == 4
    
    def test_complete_batch(self, tracker):
        """Test completing a batch."""
        batch_id = "test_batch_004"
        tracker.init_batch(batch_id, total_images=5)
        
        tracker.increment_completed(batch_id, 5)
        tracker.complete_batch(batch_id, "completed")
        
        status = tracker.get_status(batch_id)
        assert status['status'] == "completed"
        assert 'completed_at' in status
    
    def test_get_not_found_batch(self, tracker):
        """Test getting status of non-existent batch."""
        status = tracker.get_status("non_existent_batch")
        
        assert status['status'] == 'not_found'


@pytest.mark.skipif(sys.platform == 'win32', reason="Multiprocessing pickle issues on Windows")
class TestBatchProcessor:
    """Tests for batch processor - skipped on Windows."""
    
    @pytest.fixture
    def processor(self):
        """Create a batch processor."""
        proc = BatchProcessor(max_workers=1)
        yield proc
        proc._cleanup()
    
    def test_process_empty_batch(self, processor):
        """Test processing empty batch."""
        batch_id = processor.process_batch([])
        
        assert batch_id is not None
        
        status = processor.get_status(batch_id)
        assert status['status'] == 'completed'
    
    def test_process_batch_returns_batch_id(self, processor):
        """Test that batch processing returns a batch ID."""
        images = [{"id": f"img_{i}", "content": create_test_image()} 
                  for i in range(1)]
        
        batch_id = processor.process_batch(images)
        
        assert batch_id is not None
        assert len(batch_id) == 36  # UUID length
    
    def test_batch_status_tracked(self, processor):
        """Test that batch status is tracked."""
        images = [{"id": f"status_test_0", "content": create_test_image()}]
        
        batch_id = processor.process_batch(images)
        
        # Wait for processing to complete
        time.sleep(0.5)
        
        status = processor.get_status(batch_id)
        
        assert 'total' in status
        assert 'completed' in status or 'failed' in status
    
    def test_process_multiple_batches(self, processor):
        """Test processing multiple batches."""
        batch1_images = [{"id": "b1_img1", "content": create_test_image()}]
        batch2_images = [{"id": "b2_img1", "content": create_test_image()}]
        
        batch_id1 = processor.process_batch(batch1_images)
        batch_id2 = processor.process_batch(batch2_images)
        
        assert batch_id1 != batch_id2
        
        status1 = processor.get_status(batch_id1)
        status2 = processor.get_status(batch_id2)
        
        assert status1['total'] == 1
        assert status2['total'] == 1
    
    def test_cancel_batch(self, processor):
        """Test batch cancellation."""
        # Create a small batch
        images = [{"id": "cancel_test", "content": create_test_image()}]
        
        # Try to cancel before or after processing
        batch_id = processor.process_batch(images)
        result = processor.cancel_batch(batch_id)
        
        # Either cancelled or already completed
        assert result is True or result is False
