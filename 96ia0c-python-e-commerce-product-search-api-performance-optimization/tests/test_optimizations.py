import asyncio
import os

import pytest
from redis.asyncio import Redis
from sqlalchemy import text

from conftest import QueryCounter


@pytest.mark.asyncio
async def test_query_count_optimized(client, repo_modules, prepared_db):
    engine = repo_modules["database"].engine
    with QueryCounter(engine) as counter:
        response = await client.get("/api/products", params={"page": 1, "page_size": 20})
        assert response.status_code == 200
    assert counter.count <= 5


@pytest.mark.asyncio
async def test_count_query_uses_sql_count(client, repo_modules, prepared_db):
    engine = repo_modules["database"].engine
    statements = []

    from sqlalchemy import event

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement.lower())

    event.listen(engine.sync_engine, "before_cursor_execute", before_cursor_execute)
    try:
        response = await client.get("/api/products", params={"page": 1, "page_size": 10})
        assert response.status_code == 200
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", before_cursor_execute)

    assert any("count(" in stmt for stmt in statements)


@pytest.mark.asyncio
async def test_trigram_search_uses_index(repo_modules, prepared_db):
    engine = repo_modules["database"].engine
    async with engine.begin() as conn:
        await conn.execute(text("SET enable_seqscan = off"))
        result = await conn.execute(
            text(
                "EXPLAIN ANALYZE "
                "SELECT id FROM products "
                "WHERE name % :term OR description % :term"
            ),
            {"term": "wireless"},
        )
        plan = "\n".join(row[0] for row in result)
    assert "Index Scan" in plan or "Bitmap" in plan


@pytest.mark.asyncio
async def test_filter_indexes_exist(repo_modules, prepared_db):
    engine = repo_modules["database"].engine
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT indexname FROM pg_indexes WHERE tablename = 'products'")
        )
        indexes = {row[0] for row in result}

    required = {
        "ix_products_category_id",
        "ix_products_brand_id",
        "ix_products_price",
        "ix_products_rating",
        "ix_products_stock_quantity",
        "ix_products_is_active",
        "ix_products_created_at",
        "ix_products_category_price",
        "ix_products_brand_price",
        "ix_products_category_brand",
        "ix_products_active_created",
        "ix_products_active_price",
        "ix_products_active_rating",
        "ix_products_name_trgm",
        "ix_products_description_trgm",
    }
    assert required.issubset(indexes)


@pytest.mark.asyncio
async def test_cache_reuse_avoids_db_hits(client, repo_modules, prepared_db):
    redis = Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
    await redis.flushdb()

    engine = repo_modules["database"].engine
    response = await client.get("/api/products", params={"page": 1, "page_size": 10})
    assert response.status_code == 200

    with QueryCounter(engine) as counter:
        response = await client.get("/api/products", params={"page": 1, "page_size": 10})
        assert response.status_code == 200
    await redis.aclose()

    assert counter.count <= 1


@pytest.mark.asyncio
async def test_cache_invalidation_on_update(repo_modules, prepared_db):
    redis = Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
    await redis.flushdb()
    await redis.set("products:list:seed", "cached", ex=300)

    async_session = repo_modules["database"].async_session
    models = repo_modules["models"]
    async with async_session() as session:
        product = await session.get(models.Product, 1)
        product.price = 999.0
        await session.commit()

    await asyncio.sleep(0.2)
    keys = [key async for key in redis.scan_iter(match="products:list:*")]
    await redis.aclose()

    assert keys == []


@pytest.mark.asyncio
async def test_relevance_sorting_places_exact_match_first(client, prepared_db):
    response = await client.get(
        "/api/search",
        params={"q": "Wireless Headphones", "sort_by": "relevance", "page": 1},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["products"][0]["name"] == "Wireless Headphones"


@pytest.mark.asyncio
async def test_pagination_plan_uses_index(repo_modules, prepared_db):
    engine = repo_modules["database"].engine
    async with engine.begin() as conn:
        await conn.execute(text("SET enable_seqscan = off"))
        result = await conn.execute(
            text(
                "EXPLAIN ANALYZE "
                "SELECT id FROM products WHERE is_active = true "
                "ORDER BY created_at DESC OFFSET 1000 LIMIT 20"
            )
        )
        plan = "\n".join(row[0] for row in result)
    assert "Index Scan" in plan or "Bitmap" in plan


def test_engine_pool_configuration(repo_modules):
    engine = repo_modules["database"].engine
    maxsize = getattr(engine.pool, "_pool", None)
    pool_size = maxsize.maxsize if maxsize else None
    max_overflow = getattr(engine.pool, "_max_overflow", None)

    assert pool_size is not None and pool_size >= 10
    assert max_overflow is not None and max_overflow >= 20
