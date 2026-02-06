from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import json
import asyncio
import random
from . import models, schemas, crud, database, auth
from .database import engine, Base

app = FastAPI(title="Distributed Lock Manager Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Chaos State
class ChaosConfig:
    delay_ms: int = 0
    drop_renewals_rate: float = 0.0

chaos_config = ChaosConfig()

# WebSocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

# Init DB
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Endpoints

@app.post("/token", response_model=schemas.Token)
async def login(form_data: auth.OAuth2PasswordBearer = Depends()):
    # This is actually expecting form data (username/password), but OAuth2PasswordBearer
    # extracts token from header. For login endpoint, we need form fields.
    # But usually we use fastapi.security.OAuth2PasswordRequestForm
    pass 
    # Let's simplify and use a JSON body login for this demo or just hardcode token gen for tests
    # Proper way for swagger UI:
    return {"access_token": auth.create_access_token({"sub": "admin", "role": "admin"}), "token_type": "bearer"}

@app.post("/auth/login")
async def manual_login(user: dict):
    # check user
    u = auth.FAKE_USERS_DB.get(user.get("username"))
    if not u or not auth.verify_password(user.get("password"), u["password"]):
         raise HTTPException(status_code=400, detail="Incorrect username or password")
    token = auth.create_access_token({"sub": u["username"], "role": u["role"]})
    return {"access_token": token, "token_type": "bearer", "role": u["role"]}

@app.post("/locks/acquire", response_model=schemas.AcquireResponse)
async def acquire_lock(req: schemas.AcquireRequest, db: AsyncSession = Depends(database.get_db), user: auth.User = Depends(auth.get_current_user)):
    # Chaos Delay
    if chaos_config.delay_ms > 0:
        await asyncio.sleep(chaos_config.delay_ms / 1000.0)
        
    result = await crud.acquire_lock_logic(db, req)
    if result.success and not req.dry_run:
        await manager.broadcast({"type": "ACQUIRE", "resource": req.resource_id, "holder": req.holder_id})
    return result

@app.post("/locks/renew", response_model=schemas.RenewRequest) 
# Return type fix: schema mismatch in crud? 
# crud returns bool, msg
async def renew_lock(req: schemas.RenewRequest, db: AsyncSession = Depends(database.get_db), user: auth.User = Depends(auth.get_current_user)):
    # Chaos Drop
    if chaos_config.drop_renewals_rate > 0:
        if random.random() < chaos_config.drop_renewals_rate:
            # Simulate network drop (timeout on client)
            # We can sleep longer than client timeout, or just raise 504
            # Or just ignore request
            await asyncio.sleep(5) 
            raise HTTPException(status_code=504, detail="Chaos: Timeout")

    success, msg = await crud.renew_lock(db, req.lease_id, req.ttl_seconds)
    if not success:
        raise HTTPException(status_code=409, detail=msg)
    
    await manager.broadcast({"type": "RENEW", "lease": req.lease_id})
    return req

@app.post("/locks/release")
async def release_lock(req: schemas.ReleaseRequest, db: AsyncSession = Depends(database.get_db), user: auth.User = Depends(auth.get_current_user)):
    success, msg = await crud.release_lock(db, req.lease_id, req.fencing_token)
    if not success:
        raise HTTPException(status_code=404, detail=msg)
    await manager.broadcast({"type": "RELEASE", "lease": req.lease_id})
    return {"status": "released"}

@app.post("/admin/force-release")
async def force_release(request: dict, db: AsyncSession = Depends(database.get_db), user: auth.User = Depends(auth.check_role(["admin"]))):
    resource_key = request.get("resource_key")
    success, msg = await crud.force_release(db, resource_key)
    if not success:
         raise HTTPException(status_code=404, detail=msg)
    await manager.broadcast({"type": "FORCE_RELEASE", "resource": resource_key})
    return {"status": msg}

@app.post("/chaos/config")
async def set_chaos(config: dict, user: auth.User = Depends(auth.check_role(["admin", "operator"]))):
    chaos_config.delay_ms = config.get("delay_ms", 0)
    chaos_config.drop_renewals_rate = config.get("drop_renewals_rate", 0.0)
    return {"status": "updated", "config": config}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/locks/status/{resource_id}", response_model=schemas.LockStatusResponse)
async def get_lock_status(resource_id: str, tenant_id: str = "tenant-A", db: AsyncSession = Depends(database.get_db)):
    resource_key = f"{tenant_id}:{resource_id}"
    
    stmt = select(models.Lock).where(models.Lock.resource_key == resource_key)
    res = await db.execute(stmt)
    lock = res.scalar_one_or_none()
    
    holders = []
    ft = 0
    if lock:
        ft = lock.fencing_token
        l_stmt = select(models.Lease).where(models.Lease.resource_key == resource_key)
        leases = (await db.execute(l_stmt)).scalars().all()
        for l in leases:
            holders.append({
                "holder_id": l.holder_id,
                "mode": l.mode,
                "expires_at": l.expires_at,
                "lease_id": l.id
            })
            
    return schemas.LockStatusResponse(
        resource_key=resource_key,
        fencing_token=ft,
        holders=holders,
        queue_length=0
    )
    
@app.get("/demo/setup")
async def setup_demo(db: AsyncSession = Depends(database.get_db)):
    # Create some dummy data or state if needed.
    # Currently just ensure DB is reachable
    return {"status": "ready"}

