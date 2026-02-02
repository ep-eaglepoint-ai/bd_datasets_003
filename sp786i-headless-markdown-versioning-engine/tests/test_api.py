import pytest
from fastapi.testclient import TestClient

def test_create_and_update_document(client: TestClient):
    # Create Document
    response = client.post("/api/documents", json={
        "title": "Initial Doc",
        "content": "# Hello World",
        "author_id": "user1"
    })
    assert response.status_code == 200
    data = response.json()
    doc_id = data["document_id"]
    assert data["version_number"] == 1

    # Update Document (v2)
    response = client.put(f"/api/documents/{doc_id}", json={
        "content": "## Updated Content",
        "author_id": "user2"
    })
    assert response.status_code == 200
    assert response.json()["version_number"] == 2

    # Update Document (v3)
    response = client.put(f"/api/documents/{doc_id}", json={
        "content": "### Third Version",
        "author_id": "user1"
    })
    assert response.status_code == 200
    assert response.json()["version_number"] == 3

def test_get_single_document(client: TestClient):
    # Create Doc
    response = client.post("/api/documents", json={
        "title": "Single Doc",
        "content": "Original Content",
        "author_id": "user1"
    })
    doc_id = response.json()["document_id"]

    # Get Single Doc
    response = client.get(f"/api/documents/{doc_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == doc_id
    assert data["latest_content"] == "Original Content"
    assert data["latest_revision"]["version_number"] == 1

def test_document_history(client: TestClient):
    # Create Doc
    response = client.post("/api/documents", json={
        "title": "History Doc",
        "content": "v1",
        "author_id": "tester"
    })
    doc_id = response.json()["document_id"]
    
    # Add some versions
    client.put(f"/api/documents/{doc_id}", json={"content": "v2", "author_id": "tester"})
    client.put(f"/api/documents/{doc_id}", json={"content": "v3", "author_id": "tester"})

    # Check History with pagination
    response = client.get(f"/api/documents/{doc_id}/history?limit=2")
    assert response.status_code == 200
    history = response.json()
    assert len(history) == 2
    assert history[0]["version_number"] == 3
    assert history[1]["version_number"] == 2
    
    # Check next page
    response = client.get(f"/api/documents/{doc_id}/history?skip=2&limit=2")
    history = response.json()
    assert len(history) == 1
    assert history[0]["version_number"] == 1

def test_snapshot_and_rendering(client: TestClient):
    response = client.post("/api/documents", json={
        "title": "Render Doc",
        "content": "**Bold** and <script>alert('xss')</script>",
        "author_id": "malicious"
    })
    rev_id = response.json()["id"]

    # Get Snapshot with HTML
    response = client.get(f"/api/revisions/{rev_id}?include_html=true")
    assert response.status_code == 200
    data = response.json()
    assert data.get("title") == "Render Doc" # Finding 2 fix
    # Content is sanitized on storage, so <script> tags should be removed
    assert "<script>" not in data["content"]
    assert "alert('xss')" in data["content"]
    # Verify sanitization: <script> should be removed or escaped
    assert "<script>" not in data["html_content"]
    assert "<strong>Bold</strong>" in data["html_content"]

def test_storage_sanitization(client: TestClient):
    # Content with malicious script
    malicious_content = "Safe content <script>alert('xss')</script> and **bold**"
    response = client.post("/api/documents", json={
        "title": "Sanitized Doc",
        "content": malicious_content,
        "author_id": "hacker"
    })
    data = response.json()
    doc_id = data["document_id"]
    rev_id = data["id"]
    
    # Check that stored content is sanitized via snapshot
    response = client.get(f"/api/revisions/{rev_id}")
    content = response.json()["content"]
    assert "<script>" not in content
    assert "Safe content" in content
    assert "**bold**" in content

def test_diff_service(client: TestClient):
    # Create versions
    rep1 = client.post("/api/documents", json={"title": "Diff Doc", "content": "Hello World", "author_id": "user_a"})
    doc_id = rep1.json()["document_id"]
    rev1_id = rep1.json()["id"]
    
    rep2 = client.put(f"/api/documents/{doc_id}", json={"content": "Hello Brave New World", "author_id": "user_b"})
    rev2_id = rep2.json()["id"]

    # Get Diff
    response = client.get(f"/api/diff?old_revision_id={rev1_id}&new_revision_id={rev2_id}")
    assert response.status_code == 200
    diff_data = response.json()
    # Check for the inserted text in the structured list
    assert any(d["type"] == "insert" and "Brave New" in d["text"] for d in diff_data["diff"])
    # Check for the standard patch (Finding 3 fix)
    assert "patch" in diff_data
    assert "+++ v2" in diff_data["patch"]
    assert "+Hello Brave New World" in diff_data["patch"]

def test_rollback(client: TestClient):
    # v1
    rep1 = client.post("/api/documents", json={"title": "Rollback Doc", "content": "Version 1", "author_id": "user_a"})
    doc_id = rep1.json()["document_id"]
    rev1_id = rep1.json()["id"]
    
    # v2
    client.put(f"/api/documents/{doc_id}", json={"content": "Version 2", "author_id": "user_b"})
    
    # Rollback to v1
    response = client.post(f"/api/documents/{doc_id}/rollback?target_revision_id={rev1_id}&author_id=rollbacker")
    assert response.status_code == 200
    new_rev = response.json()
    assert new_rev["version_number"] == 3 # Should be additive
    
    # Verify content of v3 is same as v1
    snap = client.get(f"/api/revisions/{new_rev['id']}")
    assert snap.json()["content"] == "Version 1"
