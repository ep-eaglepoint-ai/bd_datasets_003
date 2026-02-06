from sqlalchemy.orm import Session
from . import models, schemas
from .services.markdown_service import MarkdownService
from datetime import datetime
from typing import List, Optional
import time
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

def create_document(db: Session, doc: schemas.DocumentCreate) -> schemas.RevisionMetadata:
    """
    Creates a new document and its initial revision within a transaction.
    """
    try:
        # 1. Create the base document
        db_document = models.Document(title=doc.title)
        db.add(db_document)
        db.flush() # Get the ID

        # 2. Create the first revision (v1)
        db_revision = models.Revision(
            document_id=db_document.id,
            version_number=1,
            content=MarkdownService.sanitize_markdown(doc.content),
            author_id=doc.author_id
        )
        db.add(db_revision)
        db.flush()

        # 3. Update the document with the latest revision ID
        db_document.latest_revision_id = db_revision.id
        db.commit()
        db.refresh(db_revision)
        return db_revision
    except Exception:
        db.rollback()
        raise

def update_document(db: Session, document_id: int, update_data: schemas.DocumentUpdate):
    """
    Creates a new revision for an existing document.
    Uses an optimized query to fetch only the required metadata for versioning.
    """
    for attempt in range(5):
        try:
            # Lock the document to prevent concurrent creation issues if possible
            db_document = db.query(models.Document).filter(models.Document.id == document_id).with_for_update().first()
            if not db_document:
                return None

            # Optimization: Query ONLY the max version number, not the full revision content
            max_version = db.query(func.max(models.Revision.version_number)).filter(
                models.Revision.document_id == document_id
            ).scalar()
            
            next_version = (max_version + 1) if max_version is not None else 1

            # Create new revision (immutable)
            db_revision = models.Revision(
                document_id=document_id,
                version_number=next_version,
                content=MarkdownService.sanitize_markdown(update_data.content),
                author_id=update_data.author_id
            )
            db.add(db_revision)
            db.flush()

            # Update latest revision ID on the document
            db_document.latest_revision_id = db_revision.id
            db.commit()
            try:
                db.refresh(db_revision)
            except Exception:
                # If refresh fails (e.g. in some concurrent test environments), 
                # we still have the basic data in the object
                pass
            return db_revision
        except IntegrityError:
            db.rollback()
            if attempt == 4:
                raise
            time.sleep(0.05 * (attempt + 1))
        except Exception:
            db.rollback()
            raise
    return None

def get_document_history(db: Session, document_id: int, skip: int = 0, limit: int = 100):
    """
    Retrieves metadata only for document revisions with pagination support.
    """
    # Verify document exists first
    doc_exists = db.query(models.Document.id).filter(models.Document.id == document_id).scalar()
    if not doc_exists:
        return None

    return db.query(
        models.Revision.id,
        models.Revision.document_id,
        models.Revision.version_number,
        models.Revision.author_id,
        models.Revision.timestamp
    ).filter(models.Revision.document_id == document_id)\
     .order_by(models.Revision.version_number.desc())\
     .offset(skip)\
     .limit(limit)\
     .all()

def get_document(db: Session, document_id: int):
    return db.query(models.Document).filter(models.Document.id == document_id).first()

def get_revision(db: Session, revision_id: int):
    return db.query(models.Revision).filter(models.Revision.id == revision_id).first()

def get_revision_by_version(db: Session, document_id: int, version_number: int):
    return db.query(models.Revision).filter(
        models.Revision.document_id == document_id,
        models.Revision.version_number == version_number
    ).first()

def get_latest_revision(db: Session, document_id: int):
    # Optimized lookup using the latest_revision_id in the Document table
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if doc and doc.latest_revision_id:
        return db.query(models.Revision).filter(models.Revision.id == doc.latest_revision_id).first()
    return None

def rollback_document(db: Session, document_id: int, target_revision_id: int, author_id: str):
    """
    Rolls back a document by copying a historical revision into a new revision.
    Ensures the target revision belongs to the specified document.
    """
    # 1. Fetch the historical revision with strict document ownership check
    # Also optimized to only fetch content if needed, but we need it for the copy.
    target_revision = db.query(models.Revision).filter(
        models.Revision.id == target_revision_id,
        models.Revision.document_id == document_id
    ).first()
    
    if not target_revision:
        return None

    # 2. Perform a standard update but with historical content
    return update_document(db, document_id, schemas.DocumentUpdate(
        content=target_revision.content,
        author_id=author_id
    ))

def get_all_documents(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Document).offset(skip).limit(limit).all()

