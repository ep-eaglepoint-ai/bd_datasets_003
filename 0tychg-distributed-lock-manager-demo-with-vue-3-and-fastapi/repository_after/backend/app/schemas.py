from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime
from enum import Enum

class LockMode(str, Enum):
    EXCLUSIVE = "EXCLUSIVE"
    SHARED = "SHARED"

class LockScope(str, Enum):
    GLOBAL = "GLOBAL" # Locks entire system? or global resource name? Assuming global namespace.
    TENANT = "TENANT"
    RESOURCE = "RESOURCE"

class AcquireRequest(BaseModel):
    resource_id: str
    tenant_id: str
    holder_id: str
    mode: LockMode = LockMode.EXCLUSIVE
    ttl_seconds: int = 30
    idempotency_key: Optional[str] = None
    scope: LockScope = LockScope.RESOURCE
    wait_timeout_seconds: float = 0.0 # 0 for non-blocking
    dry_run: bool = False

class AcquireResponse(BaseModel):
    success: bool
    lease_id: Optional[str] = None
    fencing_token: Optional[int] = None
    expires_at: Optional[datetime] = None
    message: Optional[str] = None
    existing_holders: Optional[List[str]] = None

class RenewRequest(BaseModel):
    lease_id: str
    ttl_seconds: int = 30

class ReleaseRequest(BaseModel):
    lease_id: str
    fencing_token: Optional[int] = None # Optional verify

class LockStatusResponse(BaseModel):
    resource_key: str
    fencing_token: int
    holders: List[dict]
    queue_length: int = 0
    
class AuditLogEntry(BaseModel):
    action: str
    timestamp: datetime
    details: Any
    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str
    role: str
