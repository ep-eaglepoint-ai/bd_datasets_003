from fastapi import FastAPI
from . import models
from .database import engine
from .api.endpoints import router as api_router

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create the database tables on startup
    models.Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(
    title="Headless Markdown Versioning Engine",
    description="A backend-only service to manage document lifecycles with strict versioning.",
    version="1.0.0",
    lifespan=lifespan
)

app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Headless Markdown Versioning Engine API"}
