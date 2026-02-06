
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("FastAPI String Reverser API started successfully")
    print("API documentation available at: http://localhost:8000/docs")
    yield
    # Shutdown logic
    print("FastAPI String Reverser API shutting down")

# Create FastAPI application instance with lifespan
app = FastAPI(
    title="String Reverser API",
    description="A minimal FastAPI application that reverses strings",
    version="1.0.0",
    lifespan=lifespan
)


# Request model with validation
class ReverseRequest(BaseModel):
    text: str = Field(..., description="The string to reverse")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "text": "Hello, World!"
            }
        }
    )


# Response model
class ReverseResponse(BaseModel):
    reversed: str = Field(..., description="The reversed string")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "reversed": "!dlroW ,olleH"
            }
        }
    )


# Health check endpoint
@app.get("/", tags=["Health"])
async def health_check():
    """
    Health check endpoint to verify the service is running.
    
    Returns:
        dict: Service status information
    """
    return {
        "status": "healthy",
        "service": "FastAPI String Reverser"
    }


# Main endpoint: reverse string
@app.post("/reverse-string", response_model=ReverseResponse, tags=["String Operations"])
async def reverse_string(request: ReverseRequest):
    """
    Reverse the input string.
    
    Args:
        request: ReverseRequest containing the text to reverse
        
    Returns:
        ReverseResponse: The reversed string
        
    Example:
        Request: {"text": "Hello, World!"}
        Response: {"reversed": "!dlroW ,olleH"}
    """
    try:
        # Reverse the string
        reversed_text = request.text[::-1]
        
        return ReverseResponse(reversed=reversed_text)
    
    except Exception as e:
        # Handle unexpected errors
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while reversing the string: {str(e)}"
        )


