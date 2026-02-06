import pytest
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient

def test_concurrent_updates(client: TestClient):
    # Create Document
    response = client.post("/api/documents", json={
        "title": "Concurrency Doc",
        "content": "Initial",
        "author_id": "system"
    })
    doc_id = response.json()["document_id"]

    num_threads = 10
    
    def update_doc(i):
        # Use a new client instance if needed, but TestClient is generally fine for threads if not using async context
        return client.put(f"/api/documents/{doc_id}", json={
            "content": f"Update from thread {i}",
            "author_id": f"user_{i}"
        })

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        results = list(executor.map(update_doc, range(num_threads)))

    # Verify all succeeded
    for res in results:
        assert res.status_code == 200

    # Verify history is intact and matches the count (1 initial + num_threads)
    response = client.get(f"/api/documents/{doc_id}/history")
    history = response.json()
    assert len(history) == num_threads + 1
    
    # Verify version numbers are unique and sequential
    versions = sorted([h["version_number"] for h in history])
    assert versions == list(range(1, num_threads + 2))

def test_concurrent_rollbacks(client: TestClient):
    # Create Document
    response = client.post("/api/documents", json={
        "title": "Rollback Concurrency",
        "content": "Initial",
        "author_id": "system"
    })
    doc_id = response.json()["document_id"]
    rev1_id = response.json()["id"]

    # Add v2
    client.put(f"/api/documents/{doc_id}", json={"content": "Update", "author_id": "user"})

    num_threads = 5
    
    def rollback_and_update(i):
        if i % 2 == 0:
            return client.post(f"/api/documents/{doc_id}/rollback?target_revision_id={rev1_id}&author_id=user_{i}")
        else:
            return client.put(f"/api/documents/{doc_id}", json={"content": f"Update {i}", "author_id": f"user_{i}"})

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        results = list(executor.map(rollback_and_update, range(num_threads)))

    # Verify all succeeded
    for res in results:
        assert res.status_code == 200

    # Verify history count (1 initial + 1 update + num_threads)
    response = client.get(f"/api/documents/{doc_id}/history")
    history = response.json()
    assert len(history) == num_threads + 2
    
    # Verify version numbers are unique and sequential
    versions = sorted([h["version_number"] for h in history])
    assert versions == list(range(1, num_threads + 3))
