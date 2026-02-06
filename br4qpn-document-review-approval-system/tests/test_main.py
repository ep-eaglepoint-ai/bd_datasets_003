import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import threading
import time

from repository_after.app.main import app, get_db
from repository_after.app.database import Base
from repository_after.app import models

# Test Database Setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./repository_after/test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    # Seed users
    users = [
        models.User(id=1, username="emp1", role="employee"),
        models.User(id=2, username="emp2", role="employee"),
        models.User(id=3, username="mgr1", role="manager"),
        models.User(id=4, username="mgr2", role="manager"),
    ]
    db.add_all(users)
    db.commit()
    db.close()

client = TestClient(app)

# REQ 1: Document Submission
def test_req1_document_submission():
    response = client.post(
        "/api/documents",
        headers={"X-User-ID": "1"},
        json={
            "title": "New Policy",
            "description": "Company Policy",
            "document_type": "POLICY",
            "content": "This is a policy content."
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "PENDING_REVIEW" # Default status
    assert data["owner_id"] == 1

# REQ 2 & 8: Role-Based Viewing
def test_req2_document_viewing():
    # emp1 submits doc1
    client.post("/api/documents", headers={"X-User-ID": "1"}, json={"title": "Doc 1", "description": "D", "document_type": "REPORT", "content": "C"})
    # emp2 submits doc2
    client.post("/api/documents", headers={"X-User-ID": "2"}, json={"title": "Doc 2", "description": "D", "document_type": "REPORT", "content": "C"})

    # Employee 1 should only see Doc 1
    resp1 = client.get("/api/documents", headers={"X-User-ID": "1"})
    docs1 = resp1.json()
    assert len(docs1) == 1
    assert docs1[0]["title"] == "Doc 1"

    # Manager should see both
    respm = client.get("/api/documents", headers={"X-User-ID": "3"})
    docsm = respm.json()
    assert len(docsm) == 2

# REQ 3, 4, 10: Approval/Rejection & Finalization (Read-only)
def test_req3_4_10_approval_state_transitions():
    client.post("/api/documents", headers={"X-User-ID": "1"}, json={"title": "T", "description": "D", "document_type": "REPORT", "content": "C"})
    
    # Manager approves
    client.post("/api/documents/1/action", headers={"X-User-ID": "3"}, json={"action": "APPROVE", "version": 1})
    
    # Check status is APPROVED
    doc = client.get("/api/documents/1", headers={"X-User-ID": "3"}).json()
    assert doc["status"] == "APPROVED"

    # Try to approve or reject again (REQ 4 & 10)
    resp = client.post("/api/documents/1/action", headers={"X-User-ID": "4"}, json={"action": "REJECT", "version": 2})
    assert resp.status_code == 409 # Should be blocked
    assert "already finalized" in resp.json()["detail"]

# REQ 5: Audit Logging
def test_req5_audit_logging():
    client.post("/api/documents", headers={"X-User-ID": "1"}, json={"title": "T", "description": "D", "document_type": "REPORT", "content": "C"})
    client.post("/api/documents/1/action", headers={"X-User-ID": "3"}, json={"action": "APPROVE", "version": 1})

    audit_resp = client.get("/api/documents/1/audit", headers={"X-User-ID": "3"})
    audit = audit_resp.json()
    assert len(audit) == 1
    assert audit[0]["previous_status"] == "PENDING_REVIEW"
    assert audit[0]["new_status"] == "APPROVED"
    assert audit[0]["acting_user_id"] == 3
    assert "timestamp" in audit[0]

# REQ 6: Role Restrictions (Managers cannot act on their own docs, Employees cannot act)
def test_req6_role_restrictions():
    # Manager submits a document (acting as an employee might, or submitting a report)
    client.post("/api/documents", headers={"X-User-ID": "3"}, json={"title": "Mgr Doc", "description": "D", "document_type": "REPORT", "content": "C"})
    
    # Manager tries to approve their own document
    resp = client.post("/api/documents/1/action", headers={"X-User-ID": "3"}, json={"action": "APPROVE", "version": 1})
    assert resp.status_code == 403
    assert "cannot approve or reject their own documents" in resp.json()["detail"]

    # Employee tries to approve someone else's document
    client.post("/api/documents", headers={"X-User-ID": "1"}, json={"title": "Emp Doc", "description": "D", "document_type": "REPORT", "content": "C"})
    resp2 = client.post("/api/documents/2/action", headers={"X-User-ID": "2"}, json={"action": "APPROVE", "version": 1})
    assert resp2.status_code == 403

# REQ 7, 9: Concurrency Control
def test_req7_9_concurrency_race_condition():
    client.post("/api/documents", headers={"X-User-ID": "1"}, json={"title": "Race Doc", "description": "D", "document_type": "REPORT", "content": "C"})
    
    results = []
    def act(user_id, action):
        try:
            # We use the same version (1) for both requests to simulate simultaneous action
            resp = client.post(
                "/api/documents/1/action",
                headers={"X-User-ID": str(user_id)},
                json={"action": action, "version": 1}
            )
            results.append(resp)
        except Exception as e:
            results.append(e)

    # Simulate simultaneous requests
    t1 = threading.Thread(target=act, args=(3, "APPROVE"))
    t2 = threading.Thread(target=act, args=(4, "REJECT"))
    
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # One should succeed (200), one MUST fail (409 conflict) due to version mismatch or state change
    status_codes = [r.status_code for r in results if hasattr(r, 'status_code')]
    assert 200 in status_codes
    assert 409 in status_codes
