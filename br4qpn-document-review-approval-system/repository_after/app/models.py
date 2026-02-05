from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Enum
from sqlalchemy.sql import func
from .database import Base
import enum

class UserRole(str, enum.Enum):
    EMPLOYEE = "employee"
    MANAGER = "manager"

class DocumentStatus(str, enum.Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"

class DocumentType(str, enum.Enum):
    POLICY = "POLICY"
    REPORT = "REPORT"
    CONTRACT = "CONTRACT"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    role = Column(String)  # employee or manager

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    description = Column(String)
    document_type = Column(String)
    content = Column(Text)
    status = Column(String, default=DocumentStatus.PENDING_REVIEW)
    owner_id = Column(Integer, ForeignKey("users.id"))
    
    # Versioning for optimistic concurrency control
    version = Column(Integer, default=1, nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    previous_status = Column(String)
    new_status = Column(String)
    acting_user_id = Column(Integer, ForeignKey("users.id"))
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
