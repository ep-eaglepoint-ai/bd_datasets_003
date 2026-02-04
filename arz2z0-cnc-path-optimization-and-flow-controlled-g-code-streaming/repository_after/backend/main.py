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

from typing import List, Optional, Union
from backend.svg_parser import SVGParser

class RawSegment(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

class OptimizeRequest(BaseModel):
    segments: Optional[List[RawSegment]] = None
    svg: Optional[str] = None

# Global state for simplicity in this single-job architecture
current_job: List[str] = []
job_status: str = "Idle"
job_progress: int = 0  # Current line index being processed
pause_event = asyncio.Event()
pause_event.set() # Initially playing by default once started.

@app.post("/optimize")
async def optimize_path(request: OptimizeRequest):
    logger.info(f"Received optimization request.")
    
    all_segments = []
    
    # 1. Process SVG if present
    if request.svg:
        try:
            svg_segments = SVGParser.parse_svg(request.svg)
            all_segments.extend(svg_segments)
        except Exception as e:
            return {"error": str(e)}
            
    # 2. Process Raw Segments if present
    if request.segments is not None:
        extracted = []
        start_id = len(all_segments)
        for i, s in enumerate(request.segments):
            p1 = Point(x=s.x1, y=s.y1)
            p2 = Point(x=s.x2, y=s.y2)
            extracted.append(Segment(id=start_id + i, p1=p1, p2=p2))
        all_segments.extend(extracted)
        
    if not all_segments and (request.segments is None and request.svg is None):
         return {"error": "No valid data provided (svg or segments properties missing)."}
    
    # Optimize
    optimized = PathOptimizer.optimize(all_segments)
    
    # Generate G-Code
    gcode = GCodeGenerator.generate(optimized)
    
    global current_job
    current_job = gcode
    
    return {"gcode": gcode, "count": len(gcode)}

@app.get("/status")
def get_status():
    global job_status, job_progress, current_job
    total = len(current_job)
    percent = int((job_progress / total) * 100) if total > 0 else 0
    
    return {
        "status": job_status,
        "progress": job_progress,
        "total_lines": total,
        "current_line": job_progress,
        "percent_complete": percent
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to WebSocket.")
    
    global job_status, job_progress, current_job, pause_event
    
    stream_task = None
    
    async def stream_job():
        global job_status, job_progress
        machine = Machine()
        
        try:
            for idx, line in enumerate(current_job):
                # Check for STOP
                if job_status == "Idle": # Stopped
                    break
                    
                job_progress = idx
                
                # Check Pause
                while not pause_event.is_set():
                     if job_status == "Idle": break 
                     job_status = "Paused"
                     # We can't easily send status here if we are pure logic 
                     # but we can rely on main loop or periodic sends
                     await asyncio.sleep(0.1)
                
                if job_status == "Idle": break
                
                if job_status != "Printing":
                    job_status = "Printing"
                    await websocket.send_text("STATUS: Printing")
                
                # 1. Send GCODE
                await websocket.send_text(f"GCODE: {line}")
                
                # 2. Wait for Machine
                await machine.process_command(line)
                
                # 3. Send ACK
                await websocket.send_text(f"ACK: {line}")
                
            # Job Done
            if job_status == "Printing": # If not stopped
                job_status = "Idle"
                job_progress = len(current_job)
                await websocket.send_text("STATUS: Idle")
                await websocket.send_text("JOB_COMPLETE")
                
        except Exception as e:
            logger.error(f"Streaming Error: {e}")
            await websocket.send_text(f"ERROR: {str(e)}")
            job_status = "Idle"

    try:
        while True:
            data = await websocket.receive_text()
            
            if data == "START":
                if not current_job:
                    await websocket.send_text("ERROR: No job loaded.")
                    continue
                
                if job_status == "Printing" or job_status == "Paused":
                    await websocket.send_text("ERROR: Job already running.")
                    continue
                
                job_status = "Printing"
                job_progress = 0
                pause_event.set()
                await websocket.send_text("STATUS: Printing")
                
                # Start background task
                if stream_task and not stream_task.done():
                    stream_task.cancel()
                stream_task = asyncio.create_task(stream_job())
                    
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
                pause_event.set() # Unblock if paused
                if stream_task:
                    stream_task.cancel()
                await websocket.send_text("STATUS: Idle")

    except WebSocketDisconnect:
        logger.info("Client disconnected.")
        if stream_task: stream_task.cancel()
        job_status = "Idle"
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")
        if stream_task: stream_task.cancel()

# Mount Static Files (Frontend)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
