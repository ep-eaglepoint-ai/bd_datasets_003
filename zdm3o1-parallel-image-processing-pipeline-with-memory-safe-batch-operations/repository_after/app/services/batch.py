"""
Batch processor with Redis status tracking and cancellation support.
"""
import os
import uuid
import time
import json
import atexit
import threading
from typing import Dict, List, Optional
from multiprocessing import Value, Process
from concurrent.futures import ProcessPoolExecutor, as_completed

import redis

from app.config import REDIS_URL, MAX_WORKERS
from app.services.processor import ImageProcessor
from app.services.workers import process_image_task


class BatchStatusTracker:
    """
    Thread-safe batch status tracker using Redis.
    
    Uses atomic counters for completed, failed, pending, and cancelled counts.
    """
    
    def __init__(self, redis_url: str = REDIS_URL):
        """
        Initialize the status tracker.
        
        Args:
            redis_url: Redis connection URL
        """
        self.redis_url = redis_url
        self._redis: Optional[redis.Redis] = None
        self._local_cache: Dict[str, Dict] = {}
        self._lock = threading.Lock()
    
    def _get_redis(self) -> redis.Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            try:
                self._redis = redis.from_url(self.redis_url, decode_responses=True)
                self._redis.ping()
            except redis.ConnectionError:
                # Fall back to local cache if Redis unavailable
                self._redis = None
        return self._redis
    
    def init_batch(self, batch_id: str, total_images: int) -> None:
        """
        Initialize batch status in Redis.
        
        Args:
            batch_id: Unique batch identifier
            total_images: Total number of images in batch
        """
        status = {
            "batch_id": batch_id,
            "status": "processing",
            "total": total_images,
            "completed": 0,
            "failed": 0,
            "pending": total_images,
            "cancelled": 0,
            "started_at": time.time(),
            "updated_at": time.time()
        }
        
        redis_client = self._get_redis()
        if redis_client:
            try:
                redis_client.hset(f"batch:{batch_id}", mapping=status)
                redis_client.expire(f"batch:{batch_id}", 86400)  # 24 hour expiry
            except redis.ConnectionError:
                pass
        
        with self._lock:
            self._local_cache[batch_id] = status
    
    def update_status(self, batch_id: str, completed: int = None, 
                      failed: int = None, cancelled: int = None,
                      status: str = None) -> None:
        """
        Update batch status counters atomically.
        
        Args:
            batch_id: Batch identifier
            completed: Number of completed images
            failed: Number of failed images
            cancelled: Number of cancelled images
            status: Overall batch status
        """
        redis_client = self._get_redis()
        
        updates = {}
        if completed is not None:
            updates["completed"] = completed
        if failed is not None:
            updates["failed"] = failed
        if cancelled is not None:
            updates["cancelled"] = cancelled
        if status is not None:
            updates["status"] = status
        updates["updated_at"] = time.time()
        
        if redis_client:
            try:
                redis_client.hincrby(f"batch:{batch_id}", "completed", completed or 0)
                redis_client.hincrby(f"batch:{batch_id}", "failed", failed or 0)
                redis_client.hincrby(f"batch:{batch_id}", "cancelled", cancelled or 0)
                redis_client.hset(f"batch:{batch_id}", "updated_at", time.time())
            except redis.ConnectionError:
                pass
        
        with self._lock:
            if batch_id in self._local_cache:
                for key, value in updates.items():
                    if key in ["completed", "failed", "cancelled"]:
                        self._local_cache[batch_id][key] = self._local_cache[batch_id].get(key, 0) + value
                    else:
                        self._local_cache[batch_id][key] = value
    
    def increment_completed(self, batch_id: str, count: int = 1) -> None:
        """Increment completed counter."""
        redis_client = self._get_redis()
        if redis_client:
            try:
                redis_client.hincrby(f"batch:{batch_id}", "completed", count)
                redis_client.hincrby(f"batch:{batch_id}", "pending", -count)
                redis_client.hset(f"batch:{batch_id}", "updated_at", time.time())
            except redis.ConnectionError:
                pass
        
        with self._lock:
            if batch_id in self._local_cache:
                self._local_cache[batch_id]["completed"] = self._local_cache[batch_id].get("completed", 0) + count
                self._local_cache[batch_id]["pending"] = self._local_cache[batch_id].get("pending", 0) - count
    
    def increment_failed(self, batch_id: str, count: int = 1) -> None:
        """Increment failed counter."""
        redis_client = self._get_redis()
        if redis_client:
            try:
                redis_client.hincrby(f"batch:{batch_id}", "failed", count)
                redis_client.hincrby(f"batch:{batch_id}", "pending", -count)
                redis_client.hset(f"batch:{batch_id}", "updated_at", time.time())
            except redis.ConnectionError:
                pass
        
        with self._lock:
            if batch_id in self._local_cache:
                self._local_cache[batch_id]["failed"] = self._local_cache[batch_id].get("failed", 0) + count
                self._local_cache[batch_id]["pending"] = self._local_cache[batch_id].get("pending", 0) - count
    
    def increment_cancelled(self, batch_id: str, count: int = 1) -> None:
        """Increment cancelled counter."""
        redis_client = self._get_redis()
        if redis_client:
            try:
                redis_client.hincrby(f"batch:{batch_id}", "cancelled", count)
                redis_client.hincrby(f"batch:{batch_id}", "pending", -count)
                redis_client.hset(f"batch:{batch_id}", "updated_at", time.time())
            except redis.ConnectionError:
                pass
        
        with self._lock:
            if batch_id in self._local_cache:
                self._local_cache[batch_id]["cancelled"] = self._local_cache[batch_id].get("cancelled", 0) + count
                self._local_cache[batch_id]["pending"] = self._local_cache[batch_id].get("pending", 0) - count
    
    def complete_batch(self, batch_id: str, status: str = "completed") -> None:
        """Mark batch as completed."""
        redis_client = self._get_redis()
        
        if redis_client:
            try:
                redis_client.hset(f"batch:{batch_id}", "status", status)
                redis_client.hset(f"batch:{batch_id}", "completed_at", time.time())
            except redis.ConnectionError:
                pass
        
        with self._lock:
            if batch_id in self._local_cache:
                self._local_cache[batch_id]["status"] = status
                self._local_cache[batch_id]["completed_at"] = time.time()
    
    def get_status(self, batch_id: str) -> Dict:
        """
        Get current batch status.
        
        Args:
            batch_id: Batch identifier
            
        Returns:
            Status dict with counts
        """
        redis_client = self._get_redis()
        
        if redis_client:
            try:
                status = redis_client.hgetall(f"batch:{batch_id}")
                if status:
                    # Convert numeric values to int
                    for key in ["total", "completed", "failed", "pending", "cancelled"]:
                        if key in status:
                            status[key] = int(status[key])
                    return status
            except redis.ConnectionError:
                pass
        
        # Fall back to local cache
        with self._lock:
            if batch_id in self._local_cache:
                return self._local_cache[batch_id]
        
        return {"status": "not_found"}
    
    def store_result(self, batch_id: str, image_id: str, result: Dict) -> None:
        """Store individual image result."""
        redis_client = self._get_redis()
        
        if redis_client:
            try:
                redis_client.rpush(f"batch:{batch_id}:results", json.dumps(result))
            except redis.ConnectionError:
                pass
    
    def get_results(self, batch_id: str) -> List[Dict]:
        """Get all results for a batch."""
        redis_client = self._get_redis()
        
        if redis_client:
            try:
                raw_results = redis_client.lrange(f"batch:{batch_id}:results", 0, -1)
                return [json.loads(r) for r in raw_results]
            except redis.ConnectionError:
                pass
        
        return []


class BatchProcessor:
    """
    Batch processor with parallel execution, cancellation, and status tracking.
    
    Uses module-level worker functions (not instance methods) for multiprocessing
    to avoid pickling issues with ProcessPoolExecutor.
    """
    
    def __init__(self, redis_url: str = REDIS_URL, max_workers: int = None):
        """
        Initialize the batch processor.
        
        Args:
            redis_url: Redis connection URL
            max_workers: Number of worker processes
        """
        self.redis_url = redis_url
        self.max_workers = max_workers or MAX_WORKERS
        self.status_tracker = BatchStatusTracker(redis_url)
        self._executor: ProcessPoolExecutor = None
        self._active_batches: Dict[str, Dict] = {}  # Store batch info including cancellation flag
        self._batch_locks: Dict[str, threading.Lock] = {}
        self._lock = threading.Lock()
        
        # Register cleanup
        atexit.register(self._cleanup)
    
    def _get_executor(self) -> ProcessPoolExecutor:
        """Get or create the executor."""
        if self._executor is None or self._executor._shutdown:
            self._executor = ProcessPoolExecutor(max_workers=self.max_workers)
        return self._executor
    
    def _cleanup(self) -> None:
        """Clean up all resources."""
        # Cancel all active batches
        with self._lock:
            for batch_id, batch_info in self._active_batches.items():
                process = batch_info.get("process")
                if process and process.is_alive():
                    process.terminate()
            self._active_batches.clear()
        
        # Shutdown executor
        if self._executor:
            self._executor.shutdown(wait=True)
    
    def process_batch(self, images: List[Dict], batch_id: str = None, 
                      temp_files: List[str] = None) -> str:
        """
        Start processing a batch of images in the background.
        
        Args:
            images: List of image dicts with 'id' and 'content'
            batch_id: Optional batch ID
            temp_files: Optional list of temp files to clean up
            
        Returns:
            Batch ID for tracking
        """
        if batch_id is None:
            batch_id = str(uuid.uuid4())
        
        if not images:
            self.status_tracker.init_batch(batch_id, 0)
            self.status_tracker.complete_batch(batch_id, "completed")
            return batch_id
        
        # Initialize status
        self.status_tracker.init_batch(batch_id, len(images))
        
        # Create cancellation flag (shared between processes)
        cancellation_flag = Value('b', 0)
        
        # Store batch lock
        with self._lock:
            self._batch_locks[batch_id] = threading.Lock()
        
        # Start processing in background - pass only picklable config, not ImageProcessor instance
        # Create ImageProcessor inside the subprocess to avoid pickling issues
        output_dir = None
        
        # Start process with module-level function and picklable arguments
        process = Process(
            target=_run_batch_subprocess,
            args=(batch_id, images, cancellation_flag, self.redis_url, self.max_workers, output_dir, temp_files)
        )
        process.start()
        
        # Store batch info including cancellation flag for later cancellation
        with self._lock:
            self._active_batches[batch_id] = {
                "process": process,
                "cancellation_flag": cancellation_flag
            }
        
        return batch_id
    
    def cancel_batch(self, batch_id: str) -> bool:
        """
        Cancel a running batch.
        
        Sets the cancellation flag and terminates the process.
        
        Args:
            batch_id: Batch identifier
            
        Returns:
            True if cancelled, False if not found
        """
        with self._lock:
            if batch_id in self._active_batches:
                batch_info = self._active_batches[batch_id]
                cancellation_flag = batch_info.get("cancellation_flag")
                process = batch_info.get("process")
                
                # Set cancellation flag to signal workers to stop
                if cancellation_flag is not None:
                    with cancellation_flag.get_lock():
                        cancellation_flag.value = 1
                
                # Terminate the process
                if process and process.is_alive():
                    process.terminate()
                
                # Remove from active batches
                del self._active_batches[batch_id]
                return True
        
        return False
    
    def get_status(self, batch_id: str) -> Dict:
        """
        Get batch status.
        
        Args:
            batch_id: Batch identifier
            
        Returns:
            Status dict
        """
        return self.status_tracker.get_status(batch_id)
    
    def get_results(self, batch_id: str) -> List[Dict]:
        """
        Get batch results.
        
        Args:
            batch_id: Batch identifier
            
        Returns:
            List of result dicts
        """
        return self.status_tracker.get_results(batch_id)


def _run_batch_subprocess(batch_id: str, images: List[Dict], cancellation_flag: Value,
                          redis_url: str, max_workers: int, output_dir: str,
                          temp_files: List[str] = None) -> None:
    """
    Subprocess function for running batch processing.
    
    This is a module-level function (not a method) to avoid pickling issues.
    
    Args:
        batch_id: Batch identifier
        images: List of image dicts
        cancellation_flag: Shared flag for cancellation
        redis_url: Redis connection URL
        max_workers: Number of worker processes
        output_dir: Output directory for processed images
        temp_files: List of temp files to clean up
    """
    try:
        # Create ImageProcessor inside subprocess (no pickling needed)
        processor = ImageProcessor(output_dir=output_dir)
        
        # Get executor
        executor = processor._get_executor()
        
        # Submit all tasks using module-level worker function
        futures = {}
        for img in images:
            task = {
                "id": img.get("id", str(uuid.uuid4())),
                "content": img.get("content"),
                "temp_path": img.get("temp_path"),  # For large files
                "output_dir": processor.output_dir
            }
            future = executor.submit(
                process_image_task,
                task,
                cancellation_flag
            )
            futures[future] = task["id"]
        
        # Collect results
        completed = 0
        failed = 0
        
        # Create status tracker in subprocess
        status_tracker = BatchStatusTracker(redis_url)
        
        for future in as_completed(futures):
            # Check for cancellation
            if cancellation_flag.value:
                # Mark remaining as cancelled
                remaining = len(futures) - completed - failed
                status_tracker.increment_cancelled(batch_id, remaining)
                break
            
            try:
                result = future.result()
                
                if result["status"] == "success":
                    completed += 1
                    status_tracker.increment_completed(batch_id)
                elif result["status"] == "cancelled":
                    status_tracker.increment_cancelled(batch_id)
                else:
                    failed += 1
                    status_tracker.increment_failed(batch_id)
                
                # Store result
                status_tracker.store_result(batch_id, result.get("id"), result)
                
            except Exception as e:
                failed += 1
                status_tracker.increment_failed(batch_id)
        
        # Determine final status
        if cancellation_flag.value:
            final_status = "cancelled"
        elif failed == len(images):
            final_status = "failed"
        else:
            final_status = "completed"
        
        status_tracker.complete_batch(batch_id, final_status)
        
    except Exception as e:
        # Create new tracker for error case
        status_tracker = BatchStatusTracker(redis_url)
        status_tracker.complete_batch(batch_id, "failed")
    finally:
        # Clean up
        if temp_files:
            for tf in temp_files:
                try:
                    if os.path.exists(tf):
                        os.remove(tf)
                except:
                    pass
