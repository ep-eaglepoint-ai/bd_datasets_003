from fastapi import FastAPI, Depends, HTTPException, Header, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from contextlib import asynccontextmanager

from . import models, schemas, database
from .database import engine, get_db

models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed users
    db = next(database.get_db())
    if db.query(models.User).count() == 0:
        users = [
            models.User(username="emp1", role="employee"),
            models.User(username="emp2", role="employee"),
            models.User(username="mgr1", role="manager"),
            models.User(username="mgr2", role="manager"),
        ]
        db.add_all(users)
        db.commit()
    yield

app = FastAPI(title="Document Review & Approval System", lifespan=lifespan)

# In a real app we'd use proper sessions/JWT. For this "minimal" app, we'll use a Header.
async def get_current_user(x_user_id: Optional[int] = Header(None), db: Session = Depends(get_db)):
    if x_user_id is None:
        raise HTTPException(status_code=401, detail="X-User-ID header missing")
    user = db.query(models.User).filter(models.User.id == x_user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

@app.post("/api/login")
def login(request: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == request.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.get("/api/users/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@app.post("/api/documents", response_model=schemas.Document)
def create_document(doc: schemas.DocumentCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db_doc = models.Document(
        **doc.model_dump(),
        owner_id=current_user.id,
        status="PENDING_REVIEW",
        version=1
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc

@app.get("/api/documents", response_model=List[schemas.Document])
def list_documents(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role == "manager":
        return db.query(models.Document).all()
    else:
        return db.query(models.Document).filter(models.Document.owner_id == current_user.id).all()

@app.get("/api/documents/{document_id}", response_model=schemas.Document)
def get_document(document_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if current_user.role != "manager" and doc.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this document")
    return doc

@app.post("/api/documents/{document_id}/action")
def document_action(document_id: int, request: schemas.ActionRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "manager":
        raise HTTPException(status_code=403, detail="Only managers can approve/reject documents")

    # Business Rule: Managers cannot act on their own documents
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if doc.owner_id == current_user.id:
        raise HTTPException(status_code=403, detail="Managers cannot approve or reject their own documents")

    # Business Rule: Only PENDING_REVIEW documents can be acted upon
    if doc.status != "PENDING_REVIEW":
        raise HTTPException(status_code=409, detail="Document is already finalized")

    # Concurrency Safety: Optimistic locking with version check
    if doc.version != request.version:
        raise HTTPException(status_code=409, detail="Document has been modified by another user")

    previous_status = doc.status
    if request.action == "APPROVE":
        new_status = "APPROVED"
    elif request.action == "REJECT":
        new_status = "REJECTED"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    # Atomic Update
    rows_affected = db.query(models.Document).filter(
        models.Document.id == document_id,
        models.Document.version == request.version
    ).update({
        "status": new_status,
        "version": models.Document.version + 1
    })

    if rows_affected == 0:
        db.rollback()
        raise HTTPException(status_code=409, detail="Concurrency error: document state changed")

    # Immutable Audit Log
    audit_log = models.AuditLog(
        document_id=document_id,
        previous_status=previous_status,
        new_status=new_status,
        acting_user_id=current_user.id
    )
    db.add(audit_log)
    db.commit()

    return {"status": "success", "new_status": new_status}

@app.get("/api/documents/{document_id}/audit", response_model=List[schemas.AuditLog])
def get_audit_logs(document_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Simple auth check for audit logs
    doc = db.query(models.Document).filter(models.Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if current_user.role != "manager" and doc.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return db.query(models.AuditLog).filter(models.AuditLog.document_id == document_id).order_by(models.AuditLog.timestamp.asc()).all()

# Serve static files
static_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "static")
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
