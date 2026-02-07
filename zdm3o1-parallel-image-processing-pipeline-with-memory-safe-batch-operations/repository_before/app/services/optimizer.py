from PIL import Image
import io


def optimize_jpeg(image: Image.Image, quality: int = 85) -> bytes:
    if image.mode == "RGBA":
        image = image.convert("RGB")
    
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=quality, optimize=True)
    return buffer.getvalue()


def optimize_webp(image: Image.Image, quality: int = 80) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality)
    return buffer.getvalue()


def optimize_for_web(image: Image.Image) -> dict:
    return {
        "jpeg": optimize_jpeg(image),
        "webp": optimize_webp(image)
    }
