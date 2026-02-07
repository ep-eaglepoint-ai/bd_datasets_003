import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "/tmp/processed_images")
MAX_IMAGE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_FORMATS = ["PNG", "JPEG", "GIF", "TIFF", "BMP", "WEBP"]

# Processing configuration
THUMBNAIL_SIZES = {
    "small": (150, 150),
    "medium": (400, 400),
    "large": (800, 800)
}

OUTPUT_FORMATS = ["JPEG", "WEBP"]

# JPEG quality settings
JPEG_QUALITY = 85
WEBP_QUALITY = 80

# Worker pool configuration
MAX_WORKERS = None  # None means use all available CPU cores

# Temporary file settings
TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/image_processing_temp")
MAX_TEMP_FILES = 1000

# Duplicate detection
HASH_CHUNK_SIZE = 8192  # 8KB chunks for hash computation

# Metrics
ENABLE_METRICS = True
