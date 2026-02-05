import pytest
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Setup test database BEFORE importing app components
# This avoids PostgreSQL connection issues during test import
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Now import app components
from fastapi.testclient import TestClient
from api.main import app
from api.database import Base, get_db
from api.models.user import User
from api.models.time_entry import TimeEntry
from api.utils.security import hash_password

# Create tables in test database
Base.metadata.create_all(bind=test_engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="function")
def client():
    yield TestClient(app)
    # Clean up data between tests
    db = TestingSessionLocal()
    try:
        db.query(TimeEntry).delete()
        db.query(User).delete()
        db.commit()
    finally:
        db.close()

@pytest.fixture
def test_user(client):
    response = client.post("/auth/register", json={
        "email": "integration@test.com",
        "password": "testpass123"
    })
    assert response.status_code == 201
    return response.json()

@pytest.fixture
def auth_token(client, test_user):
    response = client.post("/auth/login", json={
        "email": "integration@test.com",
        "password": "testpass123"
    })
    assert response.status_code == 200
    return response.json()["access_token"]

class TestAuthEndpoints:
    def test_register_user(self, client):
        response = client.post("/auth/register", json={
            "email": "newuser@test.com",
            "password": "password123"
        })
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@test.com"
        assert "id" in data
        assert "created_at" in data

    def test_register_duplicate_email(self, client, test_user):
        response = client.post("/auth/register", json={
            "email": "integration@test.com",
            "password": "different123"
        })
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()

    def test_register_invalid_email(self, client):
        response = client.post("/auth/register", json={
            "email": "notanemail",
            "password": "password123"
        })
        assert response.status_code == 422

    def test_register_short_password(self, client):
        response = client.post("/auth/register", json={
            "email": "test@test.com",
            "password": "short"
        })
        assert response.status_code == 422

    def test_login_success(self, client, test_user):
        response = client.post("/auth/login", json={
            "email": "integration@test.com",
            "password": "testpass123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, test_user):
        response = client.post("/auth/login", json={
            "email": "integration@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower() or "incorrect" in response.json()["detail"].lower()

    def test_login_nonexistent_user(self, client):
        response = client.post("/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "password123"
        })
        assert response.status_code == 401

    def test_get_current_user(self, client, auth_token):
        response = client.get("/auth/me", headers={
            "Authorization": f"Bearer {auth_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "integration@test.com"

    def test_get_current_user_no_token(self, client):
        response = client.get("/auth/me")
        assert response.status_code in [401, 403]

    def test_get_current_user_invalid_token(self, client):
        response = client.get("/auth/me", headers={
            "Authorization": "Bearer invalidtoken"
        })
        assert response.status_code == 401

class TestTimeTrackingEndpoints:
    def test_clock_in(self, client, auth_token):
        response = client.post("/time/clock-in", 
            json={"notes": "Starting work"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["is_active"] == True
        assert data["notes"] == "Starting work"
        assert data["end_at"] is None

    def test_clock_in_without_notes(self, client, auth_token):
        response = client.post("/time/clock-in", 
            json={},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code in [200, 201]
        data = response.json()
        assert data["is_active"] == True
        assert data["notes"] is None

    def test_clock_in_already_clocked_in(self, client, auth_token):
        client.post("/time/clock-in", 
            json={},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        response = client.post("/time/clock-in", 
            json={},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 400
        assert "already clocked in" in response.json()["detail"].lower()

    def test_clock_out(self, client, auth_token):
        client.post("/time/clock-in", 
            json={},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        response = client.post("/time/clock-out", 
            json={"notes": "End of day"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_active"] == False
        assert data["end_at"] is not None
        assert data["duration_hours"] is not None

    def test_clock_out_not_clocked_in(self, client, auth_token):
        response = client.post("/time/clock-out", 
            json={},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 400
        detail = response.json()["detail"].lower()
        assert "not clocked in" in detail or "no active" in detail

    def test_get_time_entries(self, client, auth_token):
        client.post("/time/clock-in", json={}, headers={"Authorization": f"Bearer {auth_token}"})
        client.post("/time/clock-out", json={}, headers={"Authorization": f"Bearer {auth_token}"})
        
        response = client.get("/time", headers={"Authorization": f"Bearer {auth_token}"})
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert len(data["entries"]) > 0
        assert data["total"] > 0

    def test_get_time_entries_with_pagination(self, client, auth_token):
        response = client.get("/time?page=1&per_page=10", 
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["per_page"] == 10

    def test_get_status_clocked_in(self, client, auth_token):
        client.post("/time/clock-in", json={}, headers={"Authorization": f"Bearer {auth_token}"})
        response = client.get("/time/status", headers={"Authorization": f"Bearer {auth_token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["is_clocked_in"] == True
        assert data["active_entry"] is not None

    def test_get_status_not_clocked_in(self, client, auth_token):
        response = client.get("/time/status", headers={"Authorization": f"Bearer {auth_token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["is_clocked_in"] == False
        assert data["active_entry"] is None

class TestReportsEndpoints:
    def test_get_summary(self, client, auth_token):
        client.post("/time/clock-in", json={}, headers={"Authorization": f"Bearer {auth_token}"})
        client.post("/time/clock-out", json={}, headers={"Authorization": f"Bearer {auth_token}"})
        
        response = client.get("/reports/summary", headers={"Authorization": f"Bearer {auth_token}"})
        assert response.status_code == 200
        data = response.json()
        assert "total_hours" in data
        assert "total_entries" in data
        assert "daily_summaries" in data
        assert "weekly_summaries" in data

    def test_get_summary_with_date_range(self, client, auth_token):
        start_date = datetime.now().date().isoformat()
        end_date = (datetime.now().date() + timedelta(days=7)).isoformat()
        
        response = client.get(
            f"/reports/summary?start_date={start_date}&end_date={end_date}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["start_date"] == start_date
        assert data["end_date"] == end_date

    def test_get_csv_export(self, client, auth_token):
        client.post("/time/clock-in", json={}, headers={"Authorization": f"Bearer {auth_token}"})
        client.post("/time/clock-out", json={}, headers={"Authorization": f"Bearer {auth_token}"})
        
        response = client.get("/reports/csv", headers={"Authorization": f"Bearer {auth_token}"})
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        content = response.text
        assert "Date" in content
        assert "Start Time" in content
        assert "End Time" in content

    def test_unauthorized_access(self, client):
        endpoints = [
            ("/time/clock-in", "POST"),
            ("/time/clock-out", "POST"),
            ("/time", "GET"),
            ("/time/status", "GET"),
            ("/reports/summary", "GET"),
            ("/reports/csv", "GET"),
        ]
        
        for endpoint, method in endpoints:
            if method == "GET":
                response = client.get(endpoint)
            else:
                response = client.post(endpoint, json={})
            assert response.status_code in [401, 403]
