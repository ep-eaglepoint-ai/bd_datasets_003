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
pause_event = asyncio.Event()
pause_event.set() # Initially playing? Or paused? Let's say playing by default once started.

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
    
    global job_status
    
    try:
        while True:
            data = await websocket.receive_text()
            
            if data == "START":
                if not current_job:
                    await websocket.send_text("ERROR: No job loaded.")
                    continue
                
                job_status = "Printing"
                await websocket.send_text("STATUS: Printing")
                
                machine = Machine()
                
                # Streaming Loop
                for line in current_job:
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
                    
                    # 3. Optional: Notify frontend of ACK?
                    # The visualizer usually draws when "sent" or "acknowledged". 
                    # Prompt: "visualizer must parse the raw G-Code text stream being sent to the machine"
                    # So "GCODE: ..." is sufficient.

                    
            elif data == "PAUSE":
                pause_event.clear()
                job_status = "Paused"
                await websocket.send_text("STATUS: Paused")
                
            elif data == "RESUME":
                pause_event.set()
                job_status = "Printing"
                await websocket.send_text("STATUS: Printing")
                
            elif data == "STOP":
                 # Reset logic?
                 pass

    except WebSocketDisconnect:
        logger.info("Client disconnected.")
    except Exception as e:
        logger.error(f"WebSocket Error: {e}")

# Mount Static Files (Frontend)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
