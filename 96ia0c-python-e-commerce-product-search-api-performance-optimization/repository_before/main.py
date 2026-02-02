from fastapi import FastAPI
from database import engine, Base
from routes import products, categories, search

app = FastAPI(title="E-commerce API")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()

app.include_router(products.router, prefix="/api/products", tags=["products"])
app.include_router(categories.router, prefix="/api/categories", tags=["categories"])
app.include_router(search.router, prefix="/api/search", tags=["search"])

@app.get("/health")
async def health():
    return {"status": "ok"}
