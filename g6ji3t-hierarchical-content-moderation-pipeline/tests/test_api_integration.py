import sqlite3
from pathlib import Path

import pytest

from app.core.config import AUDIT_DB_PATH


@pytest.mark.asyncio
async def test_api_returns_structured_metadata_and_audits(client):
    payload = {"content": "this is a normal message"}
    resp = await client.post("/moderate", json=payload)

    assert resp.status_code == 200
    data = resp.json()

    assert "final_verdict" in data
    assert "stages" in data
    assert "static_pattern" in data["stages"]
    assert "fuzzy_similarity" in data["stages"]
    assert "ml_inference" in data["stages"]
    db_path = Path(AUDIT_DB_PATH)
    assert db_path.exists()

    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute(
            "SELECT final_verdict, content FROM moderation_audit "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()

        assert row is not None
        assert row[0] in ("ALLOWED", "FLAGGED", "BLOCKED")
        assert "normal message" in row[1]
    finally:
        conn.close()
