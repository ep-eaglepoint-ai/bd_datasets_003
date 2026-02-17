from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy import text

import cache_invalidation
from database import Base, engine
from routes import categories, products, search

@asynccontextmanager
async def lifespan(app: FastAPI):
    # In test environment, DB is prepared by conftest
    # But for production, we ensure the extension exists
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    yield

app = FastAPI(title="E-commerce API", lifespan=lifespan)


app.include_router(products.router, prefix="/api/products", tags=["products"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(search.router, prefix="/api/search", tags=["search"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
