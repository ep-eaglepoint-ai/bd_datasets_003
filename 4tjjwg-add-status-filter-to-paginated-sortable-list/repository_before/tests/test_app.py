"""
Tests for the list (paginated, sortable). No filter — pre-feature state.
"""
import pytest
from app import app, get_records, RECORDS


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_list_page_returns_200(client):
    r = client.get("/")
    assert r.status_code == 200


def test_list_page_has_records(client):
    r = client.get("/")
    assert b"Records" in r.data
    assert str(len(RECORDS)).encode() in r.data or b"10" in r.data


def test_list_page_pagination(client):
    r = client.get("/?page=1&per_page=3")
    assert r.status_code == 200
    r2 = client.get("/?page=2&per_page=3")
    assert r2.status_code == 200


def test_list_page_sort_params(client):
    r = client.get("/?sort_by=created_at&order=desc")
    assert r.status_code == 200


def test_api_list_returns_200(client):
    r = client.get("/api/records")
    assert r.status_code == 200
    data = r.get_json()
    assert "records" in data
    assert "total" in data
    assert "page" in data
    assert "sort_by" in data
    assert "order" in data


def test_api_list_unfiltered_returns_all_count(client):
    r = client.get("/api/records?per_page=100")
    data = r.get_json()
    assert data["total"] == len(RECORDS)
    assert len(data["records"]) == len(RECORDS)


def test_api_list_pagination(client):
    r = client.get("/api/records?page=1&per_page=3")
    data = r.get_json()
    assert data["total"] == len(RECORDS)
    assert len(data["records"]) == 3
    assert data["page"] == 1
    assert data["per_page"] == 3


def test_api_list_sort(client):
    r = client.get("/api/records?sort_by=id&order=asc&per_page=100")
    data = r.get_json()
    ids = [rec["id"] for rec in data["records"]]
    assert ids == sorted(ids)
    r2 = client.get("/api/records?sort_by=id&order=desc&per_page=100")
    data2 = r2.get_json()
    ids2 = [rec["id"] for rec in data2["records"]]
    assert ids2 == sorted(ids2, reverse=True)


def test_get_records_sort():
    asc = get_records(sort_by="id", order="asc")
    desc = get_records(sort_by="id", order="desc")
    assert [r["id"] for r in asc] == sorted([r["id"] for r in asc])
    assert [r["id"] for r in desc] == sorted([r["id"] for r in desc], reverse=True)
