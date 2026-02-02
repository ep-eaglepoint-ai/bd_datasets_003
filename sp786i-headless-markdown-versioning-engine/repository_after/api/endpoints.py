from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from .. import crud, schemas, models
from ..database import get_db
from ..services.markdown_service import MarkdownService
from ..services.diff_service import DiffService

router = APIRouter()

@router.post("/documents", response_model=schemas.RevisionMetadata)
def create_document(doc: schemas.DocumentCreate, db: Session = Depends(get_db)):
    revision = crud.create_document(db, doc)
    return revision

@router.get("/documents", response_model=List[schemas.DocumentResponse])
def get_documents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    docs = crud.get_all_documents(db, skip=skip, limit=limit)
    for doc in docs:
        latest = crud.get_latest_revision(db, doc.id)
        doc.latest_revision = latest
        doc.latest_content = latest.content if latest else None
    return docs

@router.get("/documents/{document_id}", response_model=schemas.DocumentResponse)
def get_document(document_id: int, db: Session = Depends(get_db)):
    db_doc = crud.get_document(db, document_id)
    if not db_doc:
        raise HTTPException(status_code=404, detail="Document not found")
    latest = crud.get_latest_revision(db, db_doc.id)
    db_doc.latest_revision = latest
    db_doc.latest_content = latest.content if latest else None
    return db_doc

@router.put("/documents/{document_id}", response_model=schemas.RevisionMetadata)
def update_document(document_id: int, update: schemas.DocumentUpdate, db: Session = Depends(get_db)):
    revision = crud.update_document(db, document_id, update)
    if not revision:
        raise HTTPException(status_code=404, detail="Document not found")
    return revision

@router.get("/documents/{document_id}/history", response_model=List[schemas.RevisionMetadata])
def get_document_history(
    document_id: int, 
    skip: int = Query(0, ge=0), 
    limit: int = Query(100, ge=1, le=1000), 
    db: Session = Depends(get_db)
):
    history = crud.get_document_history(db, document_id, skip=skip, limit=limit)
    if history is None: # None means document not found in my updated crud
        raise HTTPException(status_code=404, detail="Document not found")
    return history

@router.get("/revisions/{revision_id}", response_model=schemas.RevisionFull)
def get_snapshot(revision_id: int, include_html: bool = False, db: Session = Depends(get_db)):
    revision = crud.get_revision(db, revision_id)
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")
    
    result = schemas.RevisionFull.model_validate(revision)
    if include_html:
        result.html_content = MarkdownService.render_to_html(revision.content)
    return result

@router.post("/documents/{document_id}/rollback", response_model=schemas.RevisionMetadata)
def rollback_document(document_id: int, target_revision_id: int, author_id: str, db: Session = Depends(get_db)):
    revision = crud.rollback_document(db, document_id, target_revision_id, author_id)
    if not revision:
        raise HTTPException(status_code=404, detail="Document or Revision not found")
    return revision

@router.get("/documents/{document_id}/versions/{version_number}", response_model=schemas.RevisionFull)
def get_version(document_id: int, version_number: int, include_html: bool = False, db: Session = Depends(get_db)):
    revision = crud.get_revision_by_version(db, document_id, version_number)
    if not revision:
        raise HTTPException(status_code=404, detail="Version not found for this document")
    
    result = schemas.RevisionFull.model_validate(revision)
    if include_html:
        result.html_content = MarkdownService.render_to_html(revision.content)
    return result

@router.get("/diff", response_model=schemas.DiffResponse)
def get_diff(old_revision_id: int, new_revision_id: int, db: Session = Depends(get_db)):
    old_rev = crud.get_revision(db, old_revision_id)
    new_rev = crud.get_revision(db, new_revision_id)
    if not old_rev or not new_rev:
        raise HTTPException(status_code=404, detail="One or both revisions not found")
    
    diff_data = DiffService.get_structured_diff(old_rev.content, new_rev.content)
    patch_data = DiffService.get_unified_diff(
        old_rev.content, 
        new_rev.content,
        from_file=f"v{old_rev.version_number}",
        to_file=f"v{new_rev.version_number}"
    )
    
    return schemas.DiffResponse(
        old_version_id=old_revision_id,
        new_version_id=new_revision_id,
        diff=diff_data,
        patch=patch_data
    )
