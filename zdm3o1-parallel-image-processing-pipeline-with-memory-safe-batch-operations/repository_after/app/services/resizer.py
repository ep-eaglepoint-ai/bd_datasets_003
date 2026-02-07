"""
Image resizing utilities with aspect ratio preservation.
"""
from PIL import Image
from typing import Tuple


def resize_preserve_aspect_ratio(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    """
    Resize image to fit within max_width x max_height while preserving aspect ratio.
    
    This function scales the image so that it fits entirely within the specified
    bounding box without stretching or distorting the original image.
    Images smaller than the target dimensions are not upscaled.
    
    Args:
        image: PIL Image to resize
        max_width: Maximum width of the output image
        max_height: Maximum height of the output image
        
    Returns:
        Resized PIL Image maintaining original aspect ratio
    """
    width, height = image.size
    
    # Don't upscale if image is smaller than target
    if width <= max_width and height <= max_height:
        return image.copy()
    
    # Calculate the scale factor to fit within bounds
    ratio = min(max_width / width, max_height / height)
    
    # Calculate new dimensions
    new_width = int(width * ratio)
    new_height = int(height * ratio)
    
    # Ensure dimensions are at least 1 pixel
    new_width = max(1, new_width)
    new_height = max(1, new_height)
    
    return image.resize((new_width, new_height), Image.Resampling.LANCZOS)


def resize_to_exact_size(image: Image.Image, target_width: int, target_height: int, 
                          fill_color: Tuple[int, int, int, int] = (255, 255, 255, 255)) -> Image.Image:
    """
    Resize image to exact target size, padding if necessary to preserve aspect ratio.
    
    Args:
        image: PIL Image to resize
        target_width: Exact width of output image
        target_height: Exact height of output image
        fill_color: Color to use for padding (RGBA tuple)
        
    Returns:
        Resized PIL Image with exact dimensions
    """
    # First resize to fit within target while preserving aspect ratio
    resized = resize_preserve_aspect_ratio(image, target_width, target_height)
    
    # Create output image with exact dimensions and fill color
    output = Image.new(resized.mode, (target_width, target_height), fill_color)
    
    # Calculate position to center the resized image
    left = (target_width - resized.width) // 2
    top = (target_height - resized.height) // 2
    
    # Paste resized image onto output
    output.paste(resized, (left, top))
    
    return output


def resize_thumbnail(image: Image.Image, max_size: Tuple[int, int]) -> Image.Image:
    """
    Create a thumbnail with aspect ratio preservation.
    
    This is a convenience wrapper around resize_preserve_aspect_ratio
    for creating thumbnail-sized images.
    
    Args:
        image: PIL Image to create thumbnail from
        max_size: Tuple of (max_width, max_height)
        
    Returns:
        Thumbnail PIL Image
    """
    return resize_preserve_aspect_ratio(image, max_size[0], max_size[1])
