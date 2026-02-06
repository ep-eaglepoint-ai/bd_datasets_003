from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class UserBase(BaseModel):
    username: str
    role: str

class UserCreate(UserBase):
    pass

class User(UserBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class DocumentBase(BaseModel):
    title: str
    description: str
    document_type: str
    content: str

class DocumentCreate(DocumentBase):
    pass

class Document(DocumentBase):
    id: int
    status: str
    owner_id: int
    version: int
    model_config = ConfigDict(from_attributes=True)

class AuditLog(BaseModel):
    id: int
    document_id: int
    previous_status: str
    new_status: str
    acting_user_id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)

class LoginRequest(BaseModel):
    username: str

class ActionRequest(BaseModel):
    action: str  # APPROVE or REJECT
    version: int
