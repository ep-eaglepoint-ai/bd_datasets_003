from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from app.models import User, Note
from app.database import get_db
from app.auth import get_current_user

app = FastAPI()

@app.post("/notes")
def create_note(
    title: str,
    content: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = Note(title=title, content=content, owner_id=user.id)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note

@app.get("/notes/{note_id}")
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = db.query(Note).filter_by(id=note_id, owner_id=user.id).first()
    if not note:
        raise HTTPException(status_code=404)
    return note

@app.put("/notes/{note_id}")
def update_note(
    note_id: int,
    content: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    note = db.query(Note).filter_by(id=note_id, owner_id=user.id).first()
    if not note:
        raise HTTPException(status_code=404)

    note.content = content
    db.commit()
    db.refresh(note)
    return note
