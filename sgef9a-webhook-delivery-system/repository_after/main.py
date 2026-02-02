"""
Webhook Delivery System - Main Application

A production-grade webhook delivery service with:
- HMAC-SHA256 payload signatures with timestamp
- Exponential backoff retry with jitter
- Delivery attempt tracking and history
- Webhook health scoring
- Idempotency key support
- Graceful shutdown handling
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from database import init_db, close_db
from webhooks import router as webhooks_router
from worker import start_scheduler, stop_scheduler


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger(__name__)

# Payload size limit for incoming requests (256KB)
MAX_REQUEST_SIZE = 256 * 1024


class PayloadSizeMiddleware(BaseHTTPMiddleware):
    """Middleware to validate Content-Length before reading request body."""
    
    async def dispatch(self, request: Request, call_next):
        # Get Content-Length header
        content_length = request.headers.get("content-length")
        
        if content_length:
            try:
                size = int(content_length)
                if size > MAX_REQUEST_SIZE:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": "Payload too large. Maximum size is 262144 bytes."}
                    )
            except ValueError:
                pass
        
        response = await call_next(request)
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    
    Handles startup and shutdown events for the application.
    """
    # Startup
    logger.info("Starting Webhook Delivery System...")
    
    # Initialize database
    await init_db()
    logger.info("Database initialized")
    
    # Start background scheduler
    start_scheduler()
    logger.info("Background scheduler started")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Webhook Delivery System...")
    
    # Stop scheduler gracefully
    await stop_scheduler(graceful=True)
    
    # Close database connections
    await close_db()
    
    logger.info("Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Webhook Delivery System",
    description="""
A production-grade webhook delivery service with reliable delivery features.

## Features

- **HMAC-SHA256 Signatures**: All payloads are signed with per-webhook secret keys
- **Replay Attack Prevention**: Timestamped signatures with configurable clock skew tolerance
- **Exponential Backoff**: Retry with 1s, 2s, 4s, 8s, 16s base delays
- **Random Jitter**: ±30% jitter prevents thundering herd on retry storms
- **Delivery Tracking**: Complete history of all delivery attempts
- **Health Scoring**: Exponential moving average for endpoint health
- **Idempotency**: Prevent duplicate deliveries with idempotency keys
- **Graceful Shutdown**: Complete in-flight deliveries before exit

## API Endpoints

- `POST /webhooks` - Register a new webhook
- `GET /webhooks` - List all webhooks
- `GET /webhooks/{id}` - Get webhook details
- `PATCH /webhooks/{id}` - Update webhook
- `DELETE /webhooks/{id}` - Delete webhook
- `POST /webhooks/{id}/test` - Send test payload
- `GET /webhooks/{id}/deliveries` - List delivery history
- `POST /webhooks/{id}/deliveries/{delivery_id}/retry` - Retry failed delivery
- `GET /webhooks/{id}/health` - Get health metrics
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add payload size validation middleware (before body is read)
app.add_middleware(PayloadSizeMiddleware)

# Include routers
app.include_router(webhooks_router)


@app.get("/health", tags=["health"])
async def health_check():
    """Service health check endpoint."""
    return {
        "status": "healthy",
        "service": "webhook-delivery-system",
        "version": "1.0.0",
    }


@app.get("/", tags=["root"])
async def root():
    """Root endpoint with API information."""
    return {
        "service": "Webhook Delivery System",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


def main():
    """Run the application using uvicorn."""
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
