from sqlalchemy import Column, String, Integer, DateTime, BigInteger, Enum as SAEnum, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
import datetime
from .database import Base

class LockMode(str, enum.Enum):
    EXCLUSIVE = "EXCLUSIVE"
    SHARED = "SHARED"

class LockScope(str, enum.Enum):
    GLOBAL = "GLOBAL"
    TENANT = "TENANT"
    RESOURCE = "RESOURCE"

class Lock(Base):
    __tablename__ = "locks"

    resource_key = Column(String, primary_key=True, index=True) 
    # resource_key composition: "tenant:{t_id}:resource:{r_id}" or just generic
    
    tenant_id = Column(String, nullable=False, index=True)
    resource_id = Column(String, nullable=False)
    scope = Column(String, default=LockScope.RESOURCE.value)
    
    fencing_token = Column(BigInteger, default=0)
    version = Column(Integer, default=1) # For OCC / Optimistic Locking
    
    # We maintain current state summary here for quick reads, 
    # but source of truth for validity is the leases relative to time.
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    leases = relationship("Lease", back_populates="lock", cascade="all, delete-orphan")

class Lease(Base):
    __tablename__ = "leases"

    id = Column(String, primary_key=True) # UUID
    resource_key = Column(String, ForeignKey("locks.resource_key"), nullable=False)
    holder_id = Column(String, nullable=False)
    mode = Column(String, nullable=False) # LockMode
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    idempotency_key = Column(String, nullable=True, index=True)
    
    lock = relationship("Lock", back_populates="leases")

class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    resource_key = Column(String, index=True)
    action = Column(String) # ACQUIRE, RELEASE, RENEW, FORCE_RELEASE, EXPIRE
    holder_id = Column(String)
    fencing_token = Column(BigInteger)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    details = Column(JSON, nullable=True)

class LeaseEvent(Base):
    __tablename__ = "lease_events"
    # For the timeline panel
    id = Column(Integer, primary_key=True, index=True)
    resource_key = Column(String)
    event_type = Column(String)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    data = Column(JSON)
