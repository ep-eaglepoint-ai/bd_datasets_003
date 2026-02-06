from typing import List, Dict
from fastapi import WebSocket
import json
import asyncio
from .redis_client import redis_client

class ConnectionManager:
    def __init__(self):
        # poll_id -> list of websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, poll_id: str, websocket: WebSocket):
        await websocket.accept()
        if poll_id not in self.active_connections:
            self.active_connections[poll_id] = []
        self.active_connections[poll_id].append(websocket)

    def disconnect(self, poll_id: str, websocket: WebSocket):
        if poll_id in self.active_connections:
            self.active_connections[poll_id].remove(websocket)
            if not self.active_connections[poll_id]:
                del self.active_connections[poll_id]

    async def broadcast(self, poll_id: str, message: dict):
        if poll_id in self.active_connections:
            # We use json.dumps to ensure it's a string
            message_str = json.dumps(message)
            disconnected = []
            for connection in self.active_connections[poll_id]:
                try:
                    await connection.send_text(message_str)
                except Exception:
                    disconnected.append(connection)

            for conn in disconnected:
                self.disconnect(poll_id, conn)

manager = ConnectionManager()

async def redis_listener():
    """
    Listener for Redis Pub/Sub to scale horizontally.
    This enables multiple backend instances to share broadcast state via Redis.
    When a vote is cast on any instance, it publishes to Redis, and all instances
    receive the message and broadcast to their local WebSocket connections.
    """
    try:
        pubsub = await redis_client.get_pubsub()
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message["type"] == "message":
                data = json.loads(message["data"])
                poll_id = data.get("poll_id")
                if poll_id:
                    await manager.broadcast(poll_id, {
                        "type": data.get("type", "results_update"),
                        "results": data.get("results", {})
                    })
            await asyncio.sleep(0.01)  # Small sleep to prevent tight loop
    except asyncio.CancelledError:
        # Graceful shutdown
        if redis_client.pubsub:
            await redis_client.pubsub.unsubscribe()
        raise
    except Exception as e:
        # Log error but don't crash - broadcasts will still work via direct calls
        print(f"Redis listener error: {e}")
