"""Pydantic models for request/response validation."""

from pydantic import BaseModel, Field, field_validator


class SecretCreate(BaseModel):
    """Request model for creating a secret."""

    secret: str = Field(
        ..., min_length=1, description="The secret to encrypt and store"
    )
    ttl_hours: float = Field(
        ..., ge=0.001, le=168, description="Time to live in hours (0.001 to 168)"
    )

    @field_validator("secret")
    @classmethod
    def validate_secret_not_empty(cls, v: str) -> str:
        """Ensure secret is not empty."""
        if not v or not v.strip():
            raise ValueError("Secret cannot be empty")
        return v.strip()


class SecretResponse(BaseModel):
    """Response model after creating a secret."""

    url: str = Field(..., description="Unique URL to access the secret")
    uuid: str = Field(..., description="UUID of the secret")


class SecretView(BaseModel):
    """Response model for viewing a secret."""

    secret: str = Field(..., description="The decrypted secret")
