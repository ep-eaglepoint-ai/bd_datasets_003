"""
Background task for processing batch images.
"""
from fastapi import BackgroundTasks
from typing import List, Dict

from app.services.batch import BatchProcessor


def run_batch_processing(batch_id: str, images: List[Dict], 
                        batch_processor: BatchProcessor) -> None:
    """
    Background task that processes a batch of images.
    
    Args:
        batch_id: Batch identifier
        images: List of image dicts
        batch_processor: BatchProcessor instance
    """
    batch_processor.process_batch(images, batch_id)


class BatchTaskManager:
    """Manages background batch processing tasks."""
    
    def __init__(self, batch_processor: BatchProcessor):
        self.batch_processor = batch_processor
        self._pending_batches: Dict[str, bool] = {}
    
    def submit_batch(self, batch_id: str, images: List[Dict], 
                     background_tasks: BackgroundTasks) -> str:
        """
        Submit batch for background processing.
        
        Args:
            batch_id: Batch identifier
            images: List of image dicts
            background_tasks: FastAPI BackgroundTasks
            
        Returns:
            Batch ID
        """
        self._pending_batches[batch_id] = True
        background_tasks.add_task(
            run_batch_processing,
            batch_id,
            images,
            self.batch_processor
        )
        return batch_id
    
    def is_processing(self, batch_id: str) -> bool:
        """Check if batch is still processing."""
        return self._pending_batches.get(batch_id, False)
