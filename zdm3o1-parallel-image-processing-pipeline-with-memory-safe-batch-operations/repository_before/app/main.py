from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from typing import List
import uuid

from app.services.processor import ImageProcessor
from app.services.batch import BatchProcessor

app = FastAPI()
processor = ImageProcessor()
batch_processor = BatchProcessor()


@app.post("/process")
async def process_single_image(file: UploadFile = File(...)):
    image_id = str(uuid.uuid4())
    content = await file.read()
    
    result = processor.process_image(content, image_id)
    
    return {"image_id": image_id, "results": result}


@app.post("/batch")
async def process_batch(files: List[UploadFile] = File(...)):
    batch_id = str(uuid.uuid4())
    
    images = []
    for file in files:
        content = await file.read()
        images.append({"id": str(uuid.uuid4()), "content": content})
    
    results = batch_processor.process_batch(images)
    
    return {"batch_id": batch_id, "results": results}


@app.get("/batch/{batch_id}/status")
async def get_batch_status(batch_id: str):
    return batch_processor.get_status(batch_id)
