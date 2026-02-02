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
    In a real production environment, we'd use this to sync between instances.
    For this task, we will trigger broadcasts directly after votes.
    """
    pass
