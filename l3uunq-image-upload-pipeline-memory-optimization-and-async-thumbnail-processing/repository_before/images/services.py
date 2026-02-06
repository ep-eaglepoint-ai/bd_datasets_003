import os
from io import BytesIO
from PIL import Image as PILImage
from .models import Thumbnail

THUMBNAIL_SIZES = {
    'large': (1200, 1200),
    'medium': (600, 600),
    'small': (300, 300),
    'thumb': (150, 150),
}

THUMBNAIL_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'media', 'thumbnails')


def process_image(image_record, file_data):
    os.makedirs(THUMBNAIL_DIR, exist_ok=True)

    img = PILImage.open(BytesIO(file_data))
    image_record.width = img.width
    image_record.height = img.height
    image_record.save()

    for size_name, dimensions in THUMBNAIL_SIZES.items():
        source = PILImage.open(BytesIO(file_data))
        source.thumbnail(dimensions)

        base_name = os.path.splitext(os.path.basename(image_record.original_file))[0]
        thumb_filename = f"{base_name}_{size_name}.jpg"
        thumb_path = os.path.join(THUMBNAIL_DIR, thumb_filename)

        source.save(thumb_path, 'JPEG', quality=85)

        Thumbnail.objects.create(
            image=image_record,
            size_name=size_name,
            file_path=thumb_path,
            width=source.width,
            height=source.height,
        )
