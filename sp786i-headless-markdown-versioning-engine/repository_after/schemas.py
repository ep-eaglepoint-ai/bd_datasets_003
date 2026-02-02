from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import Optional, List

class RevisionBase(BaseModel):
    content: str = Field(..., min_length=1, description="Markdown content of the revision")
    author_id: str = Field(..., min_length=3, max_length=50, description="Identifier of the author")

class RevisionCreate(RevisionBase):
    pass

class RevisionMetadata(BaseModel):
    id: int
    document_id: int
    version_number: int
    author_id: str
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

class DocumentBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Title of the document")

class DocumentCreate(DocumentBase):
    content: str = Field(..., min_length=1)
    author_id: str = Field(..., min_length=3, max_length=50)

class DocumentUpdate(BaseModel):
    content: str = Field(..., min_length=1)
    author_id: str = Field(..., min_length=3, max_length=50)

class DocumentResponse(DocumentBase):
    id: int
    created_at: datetime
    latest_revision: Optional[RevisionMetadata] = None
    latest_content: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class RevisionFull(RevisionMetadata):
    title: str
    content: str
    html_content: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class DiffResponse(BaseModel):
    old_version_id: int
    new_version_id: int
    diff: List[dict] # Structured representation of changes
    patch: str # Standard Unified Diff patch
