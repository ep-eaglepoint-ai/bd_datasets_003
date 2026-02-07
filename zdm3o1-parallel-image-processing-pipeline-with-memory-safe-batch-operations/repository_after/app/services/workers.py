"""
Worker functions for parallel image processing.

IMPORTANT: These functions must be defined at module level (not methods or closures)
to ensure they can be pickled and passed to ProcessPoolExecutor.
"""
import os
import io
import time
import tempfile
import atexit
from typing import Dict, List, Any, Optional
from multiprocessing import Value
from PIL import Image

from app.config import THUMBNAIL_SIZES, OUTPUT_FORMATS, JPEG_QUALITY, WEBP_QUALITY, MAX_IMAGE_SIZE
from app.services.resizer import resize_preserve_aspect_ratio
from app.services.optimizer import create_white_background


# Global cancellation flag - will be set from parent process
_cancellation_requested = None


def set_cancellation_flag(flag: Value):
    """Set the global cancellation flag from parent process."""
    global _cancellation_requested
    _cancellation_requested = flag


def cleanup_temp_file(file_path: str) -> None:
    """Safely remove a temporary file if it exists."""
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass


def cleanup_temp_files(file_paths: List[str]) -> None:
    """Clean up multiple temporary files."""
    for path in file_paths:
        cleanup_temp_file(path)


def _resize_and_save_single(image: Image.Image, image_id: str, size_name: str, 
                            dimensions: tuple, fmt: str, output_dir: str,
                            temp_files: List[str]) -> Dict:
    """
    Resize image to a single size and format, then save.
    
    Args:
        image: Source PIL Image
        image_id: Unique identifier for the image
        size_name: Name of the size (small, medium, large)
        dimensions: Target dimensions (width, height)
        fmt: Output format (JPEG, WEBP)
        output_dir: Directory to save output files
        temp_files: List to track temp files for cleanup
        
    Returns:
        Dict with status and output path
    """
    start_time = time.time()
    output_path = None
    
    try:
        # Check for cancellation
        if _cancellation_requested and _cancellation_requested.value:
            return {
                "status": "cancelled",
                "size": size_name,
                "format": fmt,
                "error": "Processing cancelled"
            }
        
        # Resize preserving aspect ratio
        resized = resize_preserve_aspect_ratio(image, dimensions[0], dimensions[1])
        
        # Generate output filename
        output_filename = f"{image_id}_{size_name}.{fmt.lower()}"
        output_path = os.path.join(output_dir, output_filename)
        
        # Handle JPEG alpha channel
        if fmt == "JPEG" and resized.mode == "RGBA":
            resized = create_white_background(resized)
            resized = resized.convert("RGB")
        
        # Save the image
        if fmt == "JPEG":
            resized.save(output_path, format=fmt, quality=JPEG_QUALITY, optimize=True)
        else:
            resized.save(output_path, format=fmt, quality=WEBP_QUALITY)
        
        duration = time.time() - start_time
        
        return {
            "status": "success",
            "size": size_name,
            "format": fmt,
            "path": output_path,
            "duration": duration
        }
        
    except Exception as e:
        duration = time.time() - start_time
        # Clean up partial output
        cleanup_temp_file(output_path)
        return {
            "status": "failed",
            "size": size_name,
            "format": fmt,
            "error": str(e),
            "duration": duration
        }


def _load_image_from_source(image_data: bytes, temp_path: str = None) -> Image.Image:
    """
    Load image from bytes or temp file.
    
    For large files (>MAX_IMAGE_SIZE), reads from temp file to avoid memory issues.
    
    Args:
        image_data: Raw image bytes
        temp_path: Optional path to temp file for large images
        
    Returns:
        PIL Image object
    """
    if temp_path and os.path.exists(temp_path):
        # Read from temp file
        return Image.open(temp_path)
    else:
        # Read from bytes
        return Image.open(io.BytesIO(image_data))


def _process_single_image(image_data: bytes, image_id: str, output_dir: str,
                          temp_files: List[str], temp_path: str = None) -> Dict:
    """
    Process a single image - generate all sizes and formats.
    
    Args:
        image_data: Raw image bytes
        image_id: Unique identifier
        output_dir: Directory for output files
        temp_files: List to track temp files for cleanup
        temp_path: Optional temp file path for large images
        
    Returns:
        Dict with processing results
    """
    start_time = time.time()
    created_temp = None
    
    try:
        # Check for cancellation
        if _cancellation_requested and _cancellation_requested.value:
            return {
                "id": image_id,
                "status": "cancelled",
                "error": "Processing cancelled"
            }
        
        # For large data, write to temp file first
        if len(image_data) > MAX_IMAGE_SIZE and not temp_path:
            fd, created_temp = tempfile.mkstemp(suffix='.tmp')
            os.close(fd)
            
            # Write in chunks
            with open(created_temp, 'wb') as f:
                for i in range(0, len(image_data), 8192):
                    f.write(image_data[i:i+8192])
            
            temp_files.append(created_temp)
            temp_path = created_temp
        
        # Open image from bytes or temp file
        image = _load_image_from_source(image_data, temp_path)
        
        # Process all size/format combinations
        results = {}
        for size_name, dimensions in THUMBNAIL_SIZES.items():
            for fmt in OUTPUT_FORMATS:
                result = _resize_and_save_single(
                    image, image_id, size_name, dimensions, fmt, 
                    output_dir, temp_files
                )
                key = f"{size_name}_{fmt.lower()}"
                
                if result["status"] == "success":
                    results[key] = result["path"]
                else:
                    results[key] = None
        
        duration = time.time() - start_time
        
        return {
            "id": image_id,
            "status": "success",
            "outputs": results,
            "duration": duration
        }
        
    except Exception as e:
        duration = time.time() - start_time
        return {
            "id": image_id,
            "status": "failed",
            "error": str(e),
            "duration": duration
        }


def process_image_task(task_data: Dict, cancellation_flag: Value = None) -> Dict:
    """
    Worker function for processing a single image in the pool.
    
    This function is designed to be called by ProcessPoolExecutor.
    
    Args:
        task_data: Dict containing 'id', 'content', 'output_dir', optionally 'temp_path'
        cancellation_flag: multiprocessing.Value for cancellation
        
    Returns:
        Dict with processing results
    """
    # Set cancellation flag
    if cancellation_flag is not None:
        set_cancellation_flag(cancellation_flag)
    
    # Track temp files for cleanup
    temp_files = []
    
    try:
        return _process_single_image(
            task_data.get("content"),
            task_data.get("id"),
            task_data.get("output_dir", "/tmp"),
            temp_files,
            task_data.get("temp_path")  # Pass temp_path for large files
        )
    finally:
        # Clean up any temp files created by this worker
        cleanup_temp_files(temp_files)


def process_image_task_simple(image_data: bytes, image_id: str, output_dir: str) -> Dict:
    """
    Simplified worker function for processing (without cancellation).
    
    Args:
        image_data: Raw image bytes
        image_id: Unique identifier
        output_dir: Directory for output files
        
    Returns:
        Dict with processing results
    """
    temp_files = []
    
    try:
        return _process_single_image(image_data, image_id, output_dir, temp_files)
    finally:
        cleanup_temp_files(temp_files)
