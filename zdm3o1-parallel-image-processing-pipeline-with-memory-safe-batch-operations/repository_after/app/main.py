"""
FastAPI application for parallel image processing.
"""
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from typing import List
import uuid

from app.services.processor import ImageProcessor
from app.services.batch import BatchProcessor
from app.services.tasks import BatchTaskManager
from app.services.optimizer import metrics

app = FastAPI(title="Parallel Image Processing Pipeline")

# Initialize processors
processor = ImageProcessor()
batch_processor = BatchProcessor()
task_manager = BatchTaskManager(batch_processor)


@app.post("/process")
async def process_single_image(file: UploadFile = File(...)):
    """
    Process a single image synchronously.
    
    Returns immediately with processing results.
    """
    image_id = str(uuid.uuid4())
    content = await file.read()
    
    result = processor.process_image(content, image_id)
    
    return JSONResponse(content={
        "image_id": image_id,
        "results": result
    })


@app.post("/batch")
async def process_batch(files: List[UploadFile] = File(...),
                        background_tasks: BackgroundTasks = None):
    """
    Submit batch of images for background processing.
    
    Returns immediately with batch ID and status URL.
    Processing happens asynchronously.
    """
    batch_id = str(uuid.uuid4())
    
    if not files:
        return JSONResponse(content={
            "batch_id": batch_id,
            "status": "completed",
            "message": "No files provided",
            "total": 0,
            "status_url": f"/batch/{batch_id}/status"
        })
    
    # Prepare images
    images = []
    for file in files:
        content = await file.read()
        images.append({
            "id": str(uuid.uuid4()),
            "content": content,
            "filename": file.filename
        })
    
    # If background tasks available, process in background
    if background_tasks:
        task_manager.submit_batch(batch_id, images, background_tasks)
    else:
        # Process inline if no background tasks
        batch_processor.process_batch(images, batch_id)
    
    return JSONResponse(content={
        "batch_id": batch_id,
        "status": "processing",
        "total": len(images),
        "status_url": f"/batch/{batch_id}/status",
        "cancel_url": f"/batch/{batch_id}/cancel"
    })


@app.get("/batch/{batch_id}/status")
async def get_batch_status(batch_id: str):
    """
    Get current status of a batch.
    
    Returns counts for completed, failed, pending, and cancelled images.
    """
    status = batch_processor.get_status(batch_id)
    
    if status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Batch not found")
    
    return JSONResponse(content={
        "batch_id": batch_id,
        "status": status
    })


@app.get("/batch/{batch_id}/results")
async def get_batch_results(batch_id: str):
    """
    Get results for a completed batch.
    """
    status = batch_processor.get_status(batch_id)
    
    if status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Only return results if batch is complete
    if status.get("status") == "processing":
        return JSONResponse(content={
            "batch_id": batch_id,
            "status": "processing",
            "message": "Batch still processing, results not yet available"
        })
    
    results = batch_processor.get_results(batch_id)
    
    return JSONResponse(content={
        "batch_id": batch_id,
        "status": status.get("status"),
        "results": results
    })


@app.post("/batch/{batch_id}/cancel")
async def cancel_batch(batch_id: str):
    """
    Cancel a running batch.
    
    Stops processing and cleans up partial results.
    """
    success = batch_processor.cancel_batch(batch_id)
    
    if success:
        return JSONResponse(content={
            "batch_id": batch_id,
            "status": "cancelled",
            "message": "Batch cancellation requested"
        })
    else:
        raise HTTPException(
            status_code=404, 
            detail="Batch not found or already completed"
        )


@app.get("/metrics")
async def get_metrics():
    """
    Get processing metrics.
    
    Returns timing statistics for each operation type.
    """
    stats = metrics.get_statistics()
    return JSONResponse(content={
        "metrics": stats
    })


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
