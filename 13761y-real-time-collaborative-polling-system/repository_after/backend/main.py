from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uuid
import html
import asyncio
from .models import PollCreate, VoteRequest
from .redis_client import redis_client
from .websocket_manager import manager, redis_listener

# In-memory storage for poll metadata (title, options). 
# Results are in Redis.
polls_db = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Seed data if empty
    if not polls_db:
        demo_polls = [
            {
                "title": "What is your favorite tech stack?",
                "options": ["FastAPI + React", "Next.js + Prisma", "Go + Vue", "Node + Angular"]
            },
            {
                "title": "Which cloud provider do you prefer?",
                "options": ["AWS", "Google Cloud", "Azure", "Digital Ocean"]
            }
        ]
        for poll_data in demo_polls:
            poll_id = str(uuid.uuid4())
            polls_db[poll_id] = {
                "id": poll_id,
                "title": poll_data["title"],
                "options": poll_data["options"],
                "status": "active"
            }
            await redis_client.create_poll(poll_id, poll_data["options"])

    # Start Redis Pub/Sub listener for horizontal scalability
    listener_task = asyncio.create_task(redis_listener())

    yield

    # Shutdown: Cancel listener and cleanup resources
    listener_task.cancel()
    try:
        await listener_task
    except asyncio.CancelledError:
        pass

    if redis_client.pubsub is not None:
        try:
            await redis_client.pubsub.close()
        except Exception:
            pass

    if redis_client.redis is not None:
        try:
            await redis_client.redis.aclose()
        except Exception:
            pass

app = FastAPI(title="Real-Time Polling System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/polls")
async def list_polls():
    return list(polls_db.values())

@app.post("/api/polls")
async def create_poll(poll: PollCreate):
    poll_id = str(uuid.uuid4())
    # Sanitize inputs
    sanitized_title = html.escape(poll.title)
    sanitized_options = [html.escape(opt) for opt in poll.options]
    
    polls_db[poll_id] = {
        "id": poll_id,
        "title": sanitized_title,
        "options": sanitized_options,
        "status": "active"
    }
    
    await redis_client.create_poll(poll_id, sanitized_options)
    
    return polls_db[poll_id]

@app.get("/api/polls/{poll_id}")
async def get_poll(poll_id: str):
    if poll_id not in polls_db:
        raise HTTPException(status_code=404, detail="Poll not found")
    
    results = await redis_client.get_poll_results(poll_id)
    return {
        **polls_db[poll_id],
        "results": results
    }

@app.post("/api/polls/{poll_id}/vote")
async def vote(poll_id: str, vote_req: VoteRequest, request: Request):
    if poll_id not in polls_db:
        raise HTTPException(status_code=404, detail="Poll not found")

    if polls_db[poll_id]["status"] != "active":
        raise HTTPException(status_code=400, detail="Poll is closed")

    # Support X-Forwarded-For for proxy/load balancer scenarios and testing
    client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    if not client_ip:
        client_ip = request.client.host

    success = await redis_client.cast_vote(poll_id, vote_req.option_id, client_ip)

    if not success:
        raise HTTPException(status_code=403, detail="Already voted from this IP")

    # Get updated results and publish to Redis for horizontal scaling
    updated_results = await redis_client.get_poll_results(poll_id)
    await redis_client.publish_vote_update(poll_id, updated_results)

    return {"status": "ok"}

@app.websocket("/ws/polls/{poll_id}")
async def websocket_endpoint(websocket: WebSocket, poll_id: str):
    if poll_id not in polls_db:
        await websocket.close(code=4004)
        return

    await manager.connect(poll_id, websocket)
    
    # Send current results immediately upon connection
    current_results = await redis_client.get_poll_results(poll_id)
    await websocket.send_json({"type": "initial_state", "results": current_results})

    try:
        while True:
            # Keep connection alive, though we mostly push from server
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(poll_id, websocket)