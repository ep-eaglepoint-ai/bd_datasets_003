import pytest
import time
from fastapi.testclient import TestClient

def test_performance_latest_retrieval(client: TestClient):
    # Create Document A with 10 revisions
    resp_a = client.post("/api/documents", json={"title": "Small Doc", "content": "rev 1", "author_id": "user_p"})
    doc_a_id = resp_a.json()["document_id"]
    for i in range(2, 11):
        client.put(f"/api/documents/{doc_a_id}", json={"content": f"rev {i}", "author_id": "user_p"})

    # Create Document B with 1000 revisions (industrial scale)
    resp_b = client.post("/api/documents", json={"title": "Large Doc", "content": "rev 1", "author_id": "user_p"})
    doc_b_id = resp_b.json()["document_id"]
    
    # Batch the updates to speed up test setup
    for i in range(2, 1001):
        client.put(f"/api/documents/{doc_b_id}", json={"content": f"rev {i}", "author_id": "user_p"})

    # Measure time for latest retrieval of A (10 revisions)
    iterations = 500
    start_a = time.perf_counter()
    for _ in range(iterations):
        client.get(f"/api/documents/{doc_a_id}")
    end_a = time.perf_counter()
    time_a = (end_a - start_a) / iterations

    # Measure time for latest retrieval of B (1000 revisions)
    start_b = time.perf_counter()
    for _ in range(iterations):
        client.get(f"/api/documents/{doc_b_id}")
    end_b = time.perf_counter()
    time_b = (end_b - start_b) / iterations

    print(f"\n[Performance] Avg time for 10 revisions: {time_a:.6f}s")
    print(f"[Performance] Avg time for 1000 revisions: {time_b:.6f}s")

    # The retrieval time should be independent of the number of revisions (O(1))
    # We use a 3x threshold to account for database caching/OS jitter
    assert time_b < time_a * 3, f"Retrieval time scaled linearly! 1000 revs took {time_b/time_a:.2f}x longer than 10 revs"
