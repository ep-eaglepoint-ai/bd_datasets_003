import asyncio
import pytest

from app.main import app


@pytest.mark.asyncio
async def test_circuit_breaker_triggers_and_recovers(client):
    orchestrator = app.state.orchestrator
    ml_stage = orchestrator.ml_stage
    ml_stage._breaker.failures = 0
    ml_stage._breaker.open_until_monotonic = 0.0
    ml_stage.force_fail = True

    async def call_one(i: int):
        return await client.post("/moderate", json={"content": f"message {i}"})

    resps = await asyncio.gather(*[call_one(i) for i in range(50)])
    assert all(r.status_code == 200 for r in resps)
    assert any(
        r.json()["stages"]["ml_inference"]["verdict"] == "FLAGGED"
        for r in resps
    )
    breaker_open_seen = any(
        "breaker" in (r.json()["stages"]["ml_inference"].get("reason") or "").lower()
        for r in resps
    )
    assert breaker_open_seen is True
    ml_stage._breaker.open_until_monotonic = 0.0
    ml_stage._breaker.failures = 0
    ml_stage.force_fail = False
    ml_stage.force_latency_ms = 10

    resp2 = await client.post("/moderate", json={"content": "post-recovery message"})
    assert resp2.status_code == 200

    d2 = resp2.json()
    assert d2["stages"]["ml_inference"]["score"] is not None
    assert d2["stages"]["ml_inference"]["verdict"] in ("ALLOWED", "FLAGGED")
