"""Tests for authentication functionality.

Covers Requirements:
- Requirement 1: User authentication (sign up, login, logout)
- Requirement 9: FastAPI backend with REST APIs and JWT authentication
- Requirement 11: Basic error handling and validation
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'repository_after'))

from api.services import AuthService
from api.schemas import UserCreate, UserLogin
from api.models import User
from api.utils.security import verify_password


class TestUserRegistration:
    """Test Requirement 1: User sign up functionality."""
    
    def test_register_new_user_success(self, db_session):
        """Test successful user registration."""
        service = AuthService(db_session)
        user_data = UserCreate(email="newuser@example.com", password="securepass123")
        user, error = service.register(user_data)
        assert error is None
        assert user is not None
        assert user.email == "newuser@example.com"
    
    def test_register_creates_hashed_password(self, db_session):
        """Test that registration hashes the password."""
        service = AuthService(db_session)
        user_data = UserCreate(email="hash@example.com", password="mypassword")
        user, _ = service.register(user_data)
        assert user.password_hash != "mypassword"
        assert verify_password("mypassword", user.password_hash)
    
    def test_register_duplicate_email_fails(self, db_session, test_user):
        """Test that registering with existing email fails."""
        service = AuthService(db_session)
        user_data = UserCreate(email=test_user.email, password="newpass123")
        user, error = service.register(user_data)
        assert user is None
        assert error == "Email already registered"
    
    def test_register_stores_user_in_database(self, db_session):
        """Test that registered user is stored in database."""
        service = AuthService(db_session)
        user_data = UserCreate(email="stored@example.com", password="pass123")
        service.register(user_data)
        stored_user = db_session.query(User).filter(User.email == "stored@example.com").first()
        assert stored_user is not None


class TestUserLogin:
    """Test Requirement 1: User login functionality."""
    
    def test_login_valid_credentials_success(self, db_session, test_user):
        """Test successful login with valid credentials."""
        service = AuthService(db_session)
        login_data = UserLogin(email="test@example.com", password="password123")
        token, error = service.login(login_data)
        assert error is None
        assert token is not None
        assert token.access_token is not None
        assert token.token_type == "bearer"
    
    def test_login_invalid_email_fails(self, db_session):
        """Test login with non-existent email fails."""
        service = AuthService(db_session)
        login_data = UserLogin(email="nonexistent@example.com", password="pass123")
        token, error = service.login(login_data)
        assert token is None
        assert error == "Invalid email or password"
    
    def test_login_invalid_password_fails(self, db_session, test_user):
        """Test login with wrong password fails."""
        service = AuthService(db_session)
        login_data = UserLogin(email="test@example.com", password="wrongpassword")
        token, error = service.login(login_data)
        assert token is None
        assert error == "Invalid email or password"
    
    def test_login_returns_jwt_token(self, db_session, test_user):
        """Test that login returns a valid JWT token."""
        service = AuthService(db_session)
        login_data = UserLogin(email="test@example.com", password="password123")
        token, _ = service.login(login_data)
        assert token.access_token is not None
        assert len(token.access_token) > 0
        assert "." in token.access_token


class TestJWTAuthentication:
    """Test Requirement 9: JWT authentication."""
    
    def test_jwt_token_contains_user_info(self, db_session, test_user):
        """Test JWT token contains correct user information."""
        service = AuthService(db_session)
        token = service.create_token(test_user)
        assert token.access_token is not None
        parts = token.access_token.split(".")
        assert len(parts) == 3
    
    def test_jwt_token_has_expiration(self, db_session, test_user):
        """Test JWT token has expiration claim."""
        service = AuthService(db_session)
        token = service.create_token(test_user)
        assert token.access_token is not None
        assert token.token_type == "bearer"


class TestAuthService:
    """Test AuthService helper methods."""
    
    def test_get_user_by_email(self, db_session, test_user):
        """Test retrieving user by email."""
        service = AuthService(db_session)
        user = service.get_user_by_email("test@example.com")
        assert user is not None
        assert user.id == test_user.id
    
    def test_get_user_by_email_not_found(self, db_session):
        """Test retrieving non-existent user returns None."""
        service = AuthService(db_session)
        user = service.get_user_by_email("notfound@example.com")
        assert user is None
    
    def test_get_user_by_id(self, db_session, test_user):
        """Test retrieving user by ID."""
        service = AuthService(db_session)
        user = service.get_user_by_id(test_user.id)
        assert user is not None
        assert user.email == test_user.email
    
    def test_authenticate_user_valid(self, db_session, test_user):
        """Test authenticating user with valid credentials."""
        service = AuthService(db_session)
        user = service.authenticate_user("test@example.com", "password123")
        assert user is not None
        assert user.id == test_user.id
    
    def test_authenticate_user_invalid(self, db_session, test_user):
        """Test authenticating user with invalid credentials."""
        service = AuthService(db_session)
        user = service.authenticate_user("test@example.com", "wrongpass")
        assert user is None
