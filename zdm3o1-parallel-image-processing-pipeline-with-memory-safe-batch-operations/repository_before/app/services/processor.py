from PIL import Image
import io
import os
import tempfile

SIZES = {
    "small": (150, 150),
    "medium": (400, 400),
    "large": (800, 800)
}

OUTPUT_FORMATS = ["JPEG", "WEBP"]


class ImageProcessor:
    def __init__(self):
        self.output_dir = tempfile.mkdtemp()
    
    def process_image(self, image_data: bytes, image_id: str) -> dict:
        results = {}
        
        image = Image.open(io.BytesIO(image_data))
        
        for size_name, dimensions in SIZES.items():
            for fmt in OUTPUT_FORMATS:
                output_path = self._resize_and_save(image, image_id, size_name, dimensions, fmt)
                results[f"{size_name}_{fmt.lower()}"] = output_path
        
        return results
    
    def _resize_and_save(self, image: Image.Image, image_id: str, size_name: str, dimensions: tuple, fmt: str) -> str:
        resized = image.resize(dimensions)
        
        output_filename = f"{image_id}_{size_name}.{fmt.lower()}"
        output_path = os.path.join(self.output_dir, output_filename)
        
        if fmt == "JPEG" and resized.mode == "RGBA":
            resized = resized.convert("RGB")
        
        resized.save(output_path, format=fmt, quality=85)
        
        return output_path
