"""
FastAPI application for parallel image processing.
"""
import os
import uuid
import tempfile
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from typing import List

from app.services.processor import ImageProcessor
from app.services.batch import BatchProcessor
from app.services.optimizer import metrics
from app.config import MAX_IMAGE_SIZE

app = FastAPI(title="Parallel Image Processing Pipeline")

# Initialize processors
processor = ImageProcessor()
batch_processor = BatchProcessor()


def stream_upload_to_temp(file: UploadFile) -> tuple:
    """
    Stream uploaded file to temporary storage for large files.
    
    For files > MAX_IMAGE_SIZE, streams to temp file to avoid
    loading entire content into memory.
    
    Returns:
        Tuple of (temp_file_path or None, content_bytes or None)
    """
    # Read first chunk to check size
    first_chunk = b""
    first_chunk = file.file.read(8192) if hasattr(file.file, 'read') else b""
    
    if not first_chunk:
        return None, b""
    
    # Check total size by seeking if possible
    size = len(first_chunk)
    
    # Try to get total size
    if hasattr(file.file, 'seek') and hasattr(file.file, 'tell'):
        current_pos = file.file.tell()
        file.file.seek(0, 2)  # Seek to end
        size = file.file.tell()
        file.file.seek(current_pos)  # Seek back
    
    # If file is larger than threshold, stream to temp file
    if size > MAX_IMAGE_SIZE:
        fd, temp_path = tempfile.mkstemp(suffix='.upload')
        os.close(fd)
        
        # Write first chunk
        with open(temp_path, 'wb') as f:
            f.write(first_chunk)
            # Stream remaining content
            while True:
                chunk = file.file.read(8192) if hasattr(file.file, 'read') else b""
                if not chunk:
                    break
                f.write(chunk)
        
        return temp_path, None
    
    # For small files, read remaining content
    remaining = b""
    if hasattr(file.file, 'read'):
        remaining = file.file.read()
    
    return None, first_chunk + remaining


@app.post("/process")
async def process_single_image(file: UploadFile = File(...)):
    """
    Process a single image synchronously.
    
    Returns immediately with processing results.
    """
    image_id = str(uuid.uuid4())
    
    # Stream to temp if large
    temp_path, content = stream_upload_to_temp(file)
    
    try:
        result = processor.process_image(content or temp_path, image_id)
        
        return JSONResponse(content={
            "image_id": image_id,
            "results": result
        })
    finally:
        # Clean up temp file
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/batch")
async def process_batch(files: List[UploadFile] = File(...)):
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
    
    # Prepare images - use file path for large files
    images = []
    temp_files = []  # Track temp files for cleanup
    
    for file in files:
        temp_path, content = stream_upload_to_temp(file)
        
        if temp_path:
            # Large file - use temp path
            images.append({
                "id": str(uuid.uuid4()),
                "content": None,  # Will read from temp file
                "temp_path": temp_path,
                "filename": file.filename
            })
            temp_files.append(temp_path)
        else:
            # Small file - use content bytes
            images.append({
                "id": str(uuid.uuid4()),
                "content": content,
                "filename": file.filename
            })
    
    # Process inline if no background tasks (using stored temp files tracking)
    batch_processor.process_batch(images, batch_id, temp_files)
    
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
