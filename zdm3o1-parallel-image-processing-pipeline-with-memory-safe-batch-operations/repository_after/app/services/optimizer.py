"""
Image optimization utilities for web formats.
"""
from PIL import Image
from io import BytesIO
from typing import Tuple
import threading
from collections import defaultdict


class MetricsCollector:
    """Thread-safe metrics collector for tracking operation durations."""
    
    def __init__(self):
        self._lock = threading.Lock()
        self._timings = defaultdict(list)
        self._counts = defaultdict(int)
    
    def record_timing(self, operation: str, duration: float):
        """Record timing for an operation."""
        with self._lock:
            self._timings[operation].append(duration)
            self._counts[operation] += 1
    
    def get_statistics(self, operation: str = None) -> dict:
        """Get statistics for operations."""
        with self._lock:
            if operation:
                timings = self._timings.get(operation, [])
                if not timings:
                    return {
                        "min": 0,
                        "max": 0,
                        "avg": 0,
                        "count": 0
                    }
                return {
                    "min": min(timings),
                    "max": max(timings),
                    "avg": sum(timings) / len(timings),
                    "count": len(timings)
                }
            else:
                # Return all statistics
                result = {}
                for op, timings in self._timings.items():
                    if timings:
                        result[op] = {
                            "min": min(timings),
                            "max": max(timings),
                            "avg": sum(timings) / len(timings),
                            "count": len(timings)
                        }
                return result
    
    def reset(self):
        """Reset all metrics."""
        with self._lock:
            self._timings.clear()
            self._counts.clear()


# Global metrics collector
metrics = MetricsCollector()


def create_white_background(image: Image.Image) -> Image.Image:
    """
    Create a white background and composite RGBA image onto it.
    
    JPEG doesn't support transparency, so RGBA images must be composited
    onto a solid white background before saving.
    
    Args:
        image: PIL Image with possible alpha channel
        
    Returns:
        RGB Image with white background
    """
    if image.mode == 'RGBA':
        # Create white background
        background = Image.new('RGB', image.size, (255, 255, 255))
        # Composite RGBA image onto white background
        background.paste(image, mask=image.split()[3])
        return background
    elif image.mode != 'RGB':
        # Convert other modes to RGB
        return image.convert('RGB')
    return image


def optimize_jpeg(image: Image.Image, quality: int = 85) -> bytes:
    """
    Optimize image as JPEG with proper alpha channel handling.
    
    Args:
        image: PIL Image to optimize
        quality: JPEG quality (1-100)
        
    Returns:
        JPEG bytes
    """
    import time
    start = time.time()
    
    # Handle alpha channel by compositing onto white background
    rgb_image = create_white_background(image)
    
    buffer = BytesIO()
    rgb_image.save(buffer, format='JPEG', quality=quality, optimize=True)
    
    duration = time.time() - start
    metrics.record_timing('jpeg_optimize', duration)
    
    return buffer.getvalue()


def optimize_webp(image: Image.Image, quality: int = 80) -> bytes:
    """
    Optimize image as WebP.
    
    Args:
        image: PIL Image to optimize
        quality: WebP quality (1-100)
        
    Returns:
        WebP bytes
    """
    import time
    start = time.time()
    
    buffer = BytesIO()
    image.save(buffer, format='WEBP', quality=quality)
    
    duration = time.time() - start
    metrics.record_timing('webp_optimize', duration)
    
    return buffer.getvalue()


def optimize_for_web(image: Image.Image, jpeg_quality: int = 85, webp_quality: int = 80) -> dict:
    """
    Generate multiple web-optimized formats.
    
    Args:
        image: PIL Image to optimize
        jpeg_quality: JPEG quality
        webp_quality: WebP quality
        
    Returns:
        Dictionary with 'jpeg' and 'webp' keys
    """
    return {
        'jpeg': optimize_jpeg(image, jpeg_quality),
        'webp': optimize_webp(image, webp_quality)
    }
