"""FastAPI application for ephemeral secret sharing."""
import uuid
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from .config import Config
from .models import SecretCreate, SecretResponse, SecretView
from .encryption import encryption_service
from .redis_client import redis_client

app = FastAPI(
    title="Ephemeral Secret Sharing Service",
    description="Secure secret sharing with burn-on-read functionality",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=Config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Check Redis connection on startup."""
    if not redis_client.ping():
        raise RuntimeError("Failed to connect to Redis. Please check your Redis configuration.")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    redis_healthy = redis_client.ping()
    return {
        "status": "healthy" if redis_healthy else "unhealthy",
        "redis": "connected" if redis_healthy else "disconnected"
    }


@app.post(f"{Config.API_PREFIX}/secrets", response_model=SecretResponse, status_code=status.HTTP_201_CREATED)
async def create_secret(secret_data: SecretCreate):
    """Create a new ephemeral secret.
    
    Args:
        secret_data: Secret content and TTL
        
    Returns:
        SecretResponse with URL and UUID
    """
    try:
        # Generate unique UUID
        secret_uuid = str(uuid.uuid4())
        
        # Encrypt the secret
        ciphertext, nonce = encryption_service.encrypt(secret_data.secret)
        
        # Calculate TTL in seconds
        ttl_seconds = int(secret_data.ttl_hours * 3600)
        
        # Store in Redis with expiration
        redis_client.store_secret(secret_uuid, ciphertext, nonce, ttl_seconds)
        
        # Generate URL (frontend will handle the base URL)
        url = f"/secret/{secret_uuid}"
        
        return SecretResponse(url=url, uuid=secret_uuid)
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create secret: {str(e)}"
        )


@app.get(f"{Config.API_PREFIX}/secrets/{{uuid}}", response_model=SecretView)
async def get_secret(uuid: str):
    """Retrieve and delete a secret (burn-on-read).
    
    Args:
        uuid: The UUID of the secret to retrieve
        
    Returns:
        SecretView with decrypted secret
        
    Raises:
        HTTPException: If secret not found or expired
    """
    try:
        # Atomically get and delete from Redis
        encrypted_data = redis_client.get_and_delete_secret(uuid)
        
        if encrypted_data is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Secret not found or has already been read"
            )
        
        # Decrypt the secret
        try:
            decrypted_secret = encryption_service.decrypt(
                encrypted_data["ciphertext"],
                encrypted_data["nonce"]
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to decrypt secret: {str(e)}"
            )
        
        return SecretView(secret=decrypted_secret)
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve secret: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

