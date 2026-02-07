from fastapi import FastAPI
from app.database import engine, Base

app = FastAPI(title="Notification Service")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/health")
async def health():
    return {"status": "healthy"}
