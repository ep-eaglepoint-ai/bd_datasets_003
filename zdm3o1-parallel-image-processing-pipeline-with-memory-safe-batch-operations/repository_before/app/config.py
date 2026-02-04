import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/tmp/processed_images")
MAX_IMAGE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_FORMATS = ["PNG", "JPEG", "GIF", "TIFF", "BMP", "WEBP"]
