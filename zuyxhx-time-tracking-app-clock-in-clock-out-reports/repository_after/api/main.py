"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .database import init_db
from .routers import auth_router, time_router, reports_router

settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    description="Time Tracking API with Clock In/Out and Reports",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(time_router)
app.include_router(reports_router)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()


@app.get("/")
def root():
    """Root endpoint."""
    return {"name": settings.APP_NAME, "version": "1.0.0", "status": "running"}


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}
