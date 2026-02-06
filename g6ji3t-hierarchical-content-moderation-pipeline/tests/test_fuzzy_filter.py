import pytest

@pytest.mark.asyncio
async def test_fuzzy_blocks_obfuscated_prohibited_word(client):
    payload = {"content": "Pr0hibitedW0rd"} 
    resp = await client.post("/moderate", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["final_verdict"] == "BLOCKED"
    assert "fuzzy_similarity" in data["stages"]
    assert data["stages"]["fuzzy_similarity"]["verdict"] == "BLOCKED"


@pytest.mark.asyncio
async def test_fuzzy_no_false_positive_for_dictionary_word(client):
    payload = {"content": "hello"}  
    resp = await client.post("/moderate", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["final_verdict"] != "BLOCKED"
