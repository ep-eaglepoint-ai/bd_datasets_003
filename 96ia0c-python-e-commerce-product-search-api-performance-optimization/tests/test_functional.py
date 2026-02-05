import pytest


@pytest.mark.asyncio
async def test_list_products_basic(client):
    response = await client.get("/api/products", params={"page": 1, "page_size": 5})
    assert response.status_code == 200
    payload = response.json()
    assert payload["page"] == 1
    assert len(payload["products"]) == 5


@pytest.mark.asyncio
async def test_search_products_basic(client):
    response = await client.get("/api/search", params={"q": "wireless", "page": 1})
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] > 0
    assert any("wireless" in product["name"].lower() for product in payload["products"])


@pytest.mark.asyncio
async def test_product_detail_basic(client):
    response = await client.get("/api/products/1")
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == 1
    assert payload["category"] is not None
    assert payload["brand"] is not None
