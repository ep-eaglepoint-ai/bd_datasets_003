from PIL import Image


def resize_image(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    width, height = image.size
    
    ratio = min(max_width / width, max_height / height)
    new_width = int(width * ratio)
    new_height = int(height * ratio)
    
    return image.resize((new_width, new_height))


def resize_to_fill(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    width, height = image.size
    
    ratio = max(target_width / width, target_height / height)
    new_width = int(width * ratio)
    new_height = int(height * ratio)
    
    resized = image.resize((new_width, new_height))
    
    left = (new_width - target_width) // 2
    top = (new_height - target_height) // 2
    right = left + target_width
    bottom = top + target_height
    
    return resized.crop((left, top, right, bottom))
