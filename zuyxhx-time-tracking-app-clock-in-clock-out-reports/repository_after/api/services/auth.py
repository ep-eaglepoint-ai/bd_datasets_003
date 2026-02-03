"""Authentication service."""

from typing import Optional, Tuple
from sqlalchemy.orm import Session
from ..models import User
from ..schemas import UserCreate, UserLogin, Token
from ..utils.security import hash_password, verify_password, create_access_token


class AuthService:
    """Service for authentication operations."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        return self.db.query(User).filter(User.email == email).first()
    
    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        return self.db.query(User).filter(User.id == user_id).first()
    
    def create_user(self, user_data: UserCreate) -> User:
        """Create a new user."""
        user = User(
            email=user_data.email,
            password_hash=hash_password(user_data.password)
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def authenticate_user(self, email: str, password: str) -> Optional[User]:
        """Authenticate user with email and password."""
        user = self.get_user_by_email(email)
        if not user:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user
    
    def create_token(self, user: User) -> Token:
        """Create JWT token for user."""
        access_token = create_access_token(
            data={"sub": str(user.id), "email": user.email}
        )
        return Token(access_token=access_token)
    
    def register(self, user_data: UserCreate) -> Tuple[Optional[User], Optional[str]]:
        """Register a new user."""
        existing = self.get_user_by_email(user_data.email)
        if existing:
            return None, "Email already registered"
        
        user = self.create_user(user_data)
        return user, None
    
    def login(self, login_data: UserLogin) -> Tuple[Optional[Token], Optional[str]]:
        """Login user and return token."""
        user = self.authenticate_user(login_data.email, login_data.password)
        if not user:
            return None, "Invalid email or password"
        
        token = self.create_token(user)
        return token, None
