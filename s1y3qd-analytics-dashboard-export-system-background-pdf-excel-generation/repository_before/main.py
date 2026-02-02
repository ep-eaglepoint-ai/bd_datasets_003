from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from routes.auth import router as auth_router
from routes.transactions import router as transactions_router
from database import Base, engine

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Analytics Dashboard API",
    description="API for analytics dashboard with transaction tracking",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(transactions_router)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Analytics Dashboard API",
        "docs": "/docs",
        "health": "/health"
    }


# TODO: Export functionality needs to be implemented
# Requirements:
# - POST /exports - Create export job (returns job_id immediately)
# - GET /exports/{job_id} - Get export job status and progress
# - GET /exports/{job_id}/download - Download completed export file
# 
# Features needed:
# - Background task processing for large exports (>1000 rows)
# - PDF generation with embedded charts
# - Excel generation with multiple sheets
# - Progress tracking
# - Email notification when complete
# - Signed download URLs (expire after 24h)
# - Automatic cleanup of expired files
