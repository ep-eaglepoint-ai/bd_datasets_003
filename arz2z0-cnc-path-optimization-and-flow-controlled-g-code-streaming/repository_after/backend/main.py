from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List
import asyncio
import logging
import os
from backend.models import Segment, Point
from backend.optimizer import PathOptimizer
from backend.gcode import GCodeGenerator
from backend.machine import Machine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("CNC-Backend")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RawSegment(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

class GCodeJob(BaseModel):
    gcode: List[str]

# Global state for simplicity in this single-job architecture
current_job: List[str] = []
job_status: str = "Idle"
job_progress: int = 0  # Current line index being processed
pause_event = asyncio.Event()
pause_event.set() # Initially playing by default once started.


@app.get("/status")
async def get_status():
    """
    HTTP endpoint for querying job status.
    Returns current status, progress, and job info.
    This allows the HTTP server to remain responsive during print jobs (Req 8).
    """
    return {
        "status": job_status,
        "progress": job_progress,
        "total_lines": len(current_job),
        "current_line": current_job[job_progress] if current_job and job_progress < len(current_job) else None,
        "percent_complete": (job_progress / len(current_job) * 100) if current_job else 0
    }


@app.post("/optimize")
async def optimize_path(segments: List[RawSegment]):
    logger.info(f"Received {len(segments)} segments for optimization.")
    
    # Convert raw to internal model
    internal_segments = []
    for i, s in enumerate(segments):
        p1 = Point(x=s.x1, y=s.y1)
        p2 = Point(x=s.x2, y=s.y2)
        internal_segments.append(Segment(id=i, p1=p1, p2=p2))
    
    # Optimize
    optimized = PathOptimizer.optimize(internal_segments)
    
    # Generate G-Code
    gcode = GCodeGenerator.generate(optimized)
    
    global current_job
    current_job = gcode
    
    return {"gcode": gcode, "count": len(gcode)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to WebSocket.")
    
    global job_status, job_progress
    
    try:
        while True:
            data = await websocket.receive_text()
            
            if data == "START":
                if not current_job:
                    await websocket.send_text("ERROR: No job loaded.")
                    continue
                
                job_status = "Printing"
                job_progress = 0
                await websocket.send_text("STATUS: Printing")
                
                machine = Machine()
                
                # Streaming Loop - Drip Feed Protocol
                for idx, line in enumerate(current_job):
                    job_progress = idx
                    
                    # Check pause (Pause/Resume mechanism)
                    while not pause_event.is_set():
                        job_status = "Paused"
                        # Only send status once to avoid spamming
                        # But loop checks frequently
                        await asyncio.sleep(0.1)
                        
                    if job_status != "Printing":
                         job_status = "Printing"
                         await websocket.send_text("STATUS: Printing")

                    # 1. Notify frontend: Sending command
                    await websocket.send_text(f"GCODE: {line}")
                    
                    # 2. Send to Machine and WAIT for ACK (Flow Control)
                    # "The backend must include a dummy class acting as the machine that consumes line-by-line and returns acknowledgments"
                    ack = await machine.process_command(line)
                    
                    # 3. Send ACK confirmation to frontend
                    await websocket.send_text(f"ACK: {line}")

                # Job complete
                job_status = "Idle"
                job_progress = len(current_job)
                await websocket.send_text("STATUS: Idle")
                await websocket.send_text("JOB_COMPLETE")
                    
            elif data == "PAUSE":
                pause_event.clear()
                job_status = "Paused"
                await websocket.send_text("STATUS: Paused")
                
            elif data == "RESUME":
                pause_event.set()
                job_status = "Printing"
                await websocket.send_text("STATUS: Printing")
                
            elif data == "STOP":
                job_status = "Idle"
                job_progress = 0
                pause_event.set()  # Reset pause state
                await websocket.send_text("STATUS: Idle")

    except WebSocketDisconnect:
        logger.info("Client disconnected.")
        job_status = "Idle"
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")

# Mount Static Files (Frontend)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
