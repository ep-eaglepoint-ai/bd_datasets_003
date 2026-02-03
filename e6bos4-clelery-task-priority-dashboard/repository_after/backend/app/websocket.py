"""WebSocket connection manager for real-time progress updates."""
from typing import Dict, List, Set
from fastapi import WebSocket
import asyncio
import json


class ConnectionManager:
    """Manages WebSocket connections and broadcasts progress updates."""
    
    def __init__(self):
        # Map task_id to set of connected WebSocket clients
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # All connected clients for broadcast
        self.all_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket, task_id: str = None):
        """Accept WebSocket connection and register it."""
        await websocket.accept()
        self.all_connections.append(websocket)
        
        if task_id:
            if task_id not in self.active_connections:
                self.active_connections[task_id] = set()
            self.active_connections[task_id].add(websocket)
    
    def disconnect(self, websocket: WebSocket, task_id: str = None):
        """Remove WebSocket connection from registry."""
        if websocket in self.all_connections:
            self.all_connections.remove(websocket)
        
        if task_id and task_id in self.active_connections:
            self.active_connections[task_id].discard(websocket)
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send message to a specific WebSocket client."""
        try:
            await websocket.send_json(message)
        except Exception:
            pass
    
    async def broadcast_to_task(self, task_id: str, message: dict):
        """Broadcast message to all clients subscribed to a specific task."""
        if task_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[task_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.append(connection)
            
            # Clean up disconnected clients
            for conn in disconnected:
                self.disconnect(conn, task_id)
    
    async def broadcast_all(self, message: dict):
        """Broadcast message to all connected clients."""
        disconnected = []
        for connection in self.all_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            if conn in self.all_connections:
                self.all_connections.remove(conn)


# Global connection manager instance
manager = ConnectionManager()
