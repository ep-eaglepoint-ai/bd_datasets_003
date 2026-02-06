from fastapi import Header, HTTPException
from typing import Optional
from app.models import User
from app.database import SessionLocal

# Minimal mock auth
def get_current_user(token: Optional[str] = Header(None)):
    if not token:
        # For simplicity in this prompt context, we might assume a mock user if no token, 
        # or enforce it. The prompt implies authentication is implemented.
        # Let's enforce a simple token check against the DB.
        raise HTTPException(status_code=401, detail="Missing token")
    
    db = SessionLocal()
    # In a real app this would verify a JWT, etc. Here we just look up a token.
    user = db.query(User).filter(User.token == token).first()
    db.close()
    
    if not user:
         raise HTTPException(status_code=401, detail="Invalid token")
    return user
