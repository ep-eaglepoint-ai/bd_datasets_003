from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Store the latest revision ID for O(1) lookup
    latest_revision_id = Column(Integer, index=True, nullable=True)

    revisions = relationship("Revision", back_populates="document", cascade="all, delete-orphan")

class Revision(Base):
    __tablename__ = "revisions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(String, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    document = relationship("Document", back_populates="revisions")

    @property
    def title(self):
        return self.document.title if self.document else "Unknown"

    # Composite index for faster history retrieval by document
    __table_args__ = (
        Index("ix_revision_document_version", "document_id", "version_number", unique=True),
    )
