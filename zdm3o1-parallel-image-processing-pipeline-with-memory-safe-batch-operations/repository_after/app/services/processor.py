"""
Image processor with parallel processing capabilities.
"""
import os
import io
import uuid
import tempfile
import atexit
import threading
from typing import Dict, List, Optional, Tuple
from concurrent.futures import ProcessPoolExecutor, as_completed
from multiprocessing import Value
from PIL import Image

from app.config import THUMBNAIL_SIZES, OUTPUT_FORMATS, MAX_WORKERS, MAX_IMAGE_SIZE
from app.services.resizer import resize_preserve_aspect_ratio
from app.services.workers import process_image_task
from app.services.utils import compute_sha256_chunked, validate_image_format


class ImageProcessor:
    """
    Memory-safe image processor with parallel processing support.
    
    Features:
    - Chunked reading for large images
    - Duplicate detection via SHA-256
    - Multiple output sizes and formats
    - Temporary file cleanup
    """
    
    def __init__(self, output_dir: str = None, max_workers: int = None):
        """
        Initialize the image processor.
        
        Args:
            output_dir: Directory for output files
            max_workers: Number of worker processes (None = all CPU cores)
        """
        self.output_dir = output_dir or tempfile.mkdtemp(prefix="image_processor_")
        self.max_workers = max_workers or MAX_WORKERS
        self._executor: Optional[ProcessPoolExecutor] = None
        self._hash_cache: Dict[str, str] = {}  # Track seen hashes
        self._cache_lock = threading.Lock()
        self._temp_files: List[str] = []  # Track temp files for cleanup
        
        # Create output directory if needed
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Register cleanup handler
        atexit.register(self._cleanup)
    
    def _cleanup(self) -> None:
        """Clean up resources on shutdown."""
        # Clean up temp files
        for tf in self._temp_files:
            try:
                if os.path.exists(tf):
                    os.remove(tf)
            except:
                pass
        self._temp_files.clear()
        
        if self._executor:
            self._executor.shutdown(wait=False)
    
    def _get_executor(self) -> ProcessPoolExecutor:
        """Get or create the process pool executor."""
        if self._executor is None or self._executor._shutdown:
            self._executor = ProcessPoolExecutor(max_workers=self.max_workers)
        return self._executor
    
    def _is_duplicate(self, content: bytes) -> bool:
        """
        Check if image content is a duplicate based on SHA-256 hash.
        
        Args:
            content: Image bytes or file path
            
        Returns:
            True if duplicate, False otherwise
        """
        with self._cache_lock:
            file_hash = compute_sha256_chunked(content)
            if file_hash in self._hash_cache:
                return True
            self._hash_cache[file_hash] = True
            return False
    
    def _load_image(self, image_data: bytes, temp_file_path: str = None) -> Tuple[Image.Image, str]:
        """
        Load image from bytes, optionally streaming to temp file for large images.
        
        Args:
            image_data: Raw image bytes
            temp_file_path: Optional pre-existing temp file path
            
        Returns:
            Tuple of (PIL Image object, temp_file_path or None)
        """
        created_temp = None
        
        # For large data, write to temp file first
        if len(image_data) > MAX_IMAGE_SIZE:
            if temp_file_path is None:
                fd, temp_file_path = tempfile.mkstemp(suffix='.tmp')
                os.close(fd)
                created_temp = temp_file_path
                
                # Write in chunks to avoid memory issues
                with open(temp_file_path, 'wb') as f:
                    for i in range(0, len(image_data), 8192):
                        f.write(image_data[i:i+8192])
            else:
                # Use provided temp path
                created_temp = temp_file_path
                with open(temp_file_path, 'wb') as f:
                    for i in range(0, len(image_data), 8192):
                        f.write(image_data[i:i+8192])
            
            # Track temp file for cleanup
            if created_temp:
                self._temp_files.append(created_temp)
            
            return Image.open(temp_file_path), temp_file_path
        else:
            return Image.open(io.BytesIO(image_data)), None
    
    def process_image(self, image_data: bytes, image_id: str = None,
                      skip_duplicate: bool = True) -> Dict:
        """
        Process a single image - generate all sizes and formats.
        
        Args:
            image_data: Raw image bytes
            image_id: Optional image ID (generated if not provided)
            skip_duplicate: Whether to skip duplicate images
            
        Returns:
            Dict with processing results
        """
        if image_id is None:
            image_id = str(uuid.uuid4())
        
        # Validate image format
        is_valid, fmt, error = validate_image_format(image_data)
        if not is_valid:
            return {
                "id": image_id,
                "status": "failed",
                "error": error
            }
        
        # Check for duplicates
        if skip_duplicate and self._is_duplicate(image_data):
            return {
                "id": image_id,
                "status": "duplicate",
                "error": "Duplicate image detected, skipped"
            }
        
        temp_path = None
        try:
            # Load image - will create temp file for large images
            image, temp_path = self._load_image(image_data)
            
            results = {}
            
            # Generate all size/format combinations
            for size_name, dimensions in THUMBNAIL_SIZES.items():
                for fmt in OUTPUT_FORMATS:
                    output_path = self._resize_and_save(
                        image, image_id, size_name, dimensions, fmt
                    )
                    results[f"{size_name}_{fmt.lower()}"] = output_path
            
            return {
                "id": image_id,
                "status": "success",
                "outputs": results
            }
            
        except Exception as e:
            return {
                "id": image_id,
                "status": "failed",
                "error": str(e)
            }
        finally:
            # Clean up temp file if it was created
            if temp_path and temp_path in self._temp_files:
                try:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    self._temp_files.remove(temp_path)
                except:
                    pass
    
    def _resize_and_save(self, image: Image.Image, image_id: str,
                         size_name: str, dimensions: tuple, fmt: str) -> str:
        """
        Resize and save image.
        
        Args:
            image: Source PIL Image
            image_id: Unique identifier
            size_name: Size name (small, medium, large)
            dimensions: Target dimensions
            fmt: Output format
            
        Returns:
            Path to saved file
        """
        # Resize preserving aspect ratio
        resized = resize_preserve_aspect_ratio(image, dimensions[0], dimensions[1])
        
        # Generate output path
        output_filename = f"{image_id}_{size_name}.{fmt.lower()}"
        output_path = os.path.join(self.output_dir, output_filename)
        
        # Handle JPEG alpha channel
        if fmt == "JPEG" and resized.mode == "RGBA":
            background = Image.new("RGB", resized.size, (255, 255, 255))
            background.paste(resized, mask=resized.split()[3])
            resized = background
        
        # Save
        if fmt == "JPEG":
            resized.save(output_path, format=fmt, quality=85, optimize=True)
        else:
            resized.save(output_path, format=fmt, quality=80)
        
        return output_path
    
    def process_batch(self, images: List[Dict], 
                     cancellation_flag: Value = None) -> List[Dict]:
        """
        Process multiple images in parallel using ProcessPoolExecutor.
        
        Args:
            images: List of dicts with 'id' and 'content' keys
            cancellation_flag: Optional multiprocessing.Value for cancellation
            
        Returns:
            List of processing results
        """
        if not images:
            return []
        
        executor = self._get_executor()
        
        # Prepare tasks
        tasks = []
        for img in images:
            task = {
                "id": img.get("id", str(uuid.uuid4())),
                "content": img.get("content"),
                "output_dir": self.output_dir
            }
            tasks.append(task)
        
        # Submit tasks to pool
        results = []
        futures = {
            executor.submit(process_image_task, task, cancellation_flag): task["id"]
            for task in tasks
        }
        
        # Collect results
        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                task_id = futures[future]
                results.append({
                    "id": task_id,
                    "status": "failed",
                    "error": str(e)
                })
        
        return results
    
    def cleanup(self) -> None:
        """Clean up temporary files and shutdown executor."""
        # Clean up temp files
        for tf in self._temp_files:
            try:
                if os.path.exists(tf):
                    os.remove(tf)
            except:
                pass
        self._temp_files.clear()
        
        if self._executor:
            self._executor.shutdown(wait=True)
            self._executor = None
    
    def get_output_dir(self) -> str:
        """Get the output directory."""
        return self.output_dir
