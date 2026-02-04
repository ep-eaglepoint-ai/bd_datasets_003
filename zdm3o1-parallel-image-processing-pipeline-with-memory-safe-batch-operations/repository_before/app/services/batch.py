from app.services.processor import ImageProcessor
from typing import List, Dict
import time


class BatchProcessor:
    def __init__(self):
        self.processor = ImageProcessor()
        self.batch_status = {}
    
    def process_batch(self, images: List[Dict]) -> List[Dict]:
        results = []
        
        for image in images:
            try:
                result = self.processor.process_image(image["content"], image["id"])
                results.append({"id": image["id"], "status": "success", "outputs": result})
            except Exception as e:
                results.append({"id": image["id"], "status": "failed", "error": str(e)})
        
        return results
    
    def get_status(self, batch_id: str) -> Dict:
        return self.batch_status.get(batch_id, {"status": "not_found"})
