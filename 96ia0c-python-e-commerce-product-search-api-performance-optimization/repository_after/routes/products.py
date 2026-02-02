import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from cache import DETAIL_TTL_SECONDS, LIST_TTL_SECONDS, cache_get, cache_set, make_cache_key
from database import get_db, get_redis
from models import Product
from schemas import BrandResponse, CategoryResponse, ProductImageResponse, ProductListResponse, ProductResponse

router = APIRouter()


def _build_filters(
    category_id: Optional[int],
    brand_id: Optional[int],
    min_price: Optional[float],
    max_price: Optional[float],
    in_stock: Optional[bool],
) -> list:
    filters = [Product.is_active == True]
    if category_id:
        filters.append(Product.category_id == category_id)
    if brand_id:
        filters.append(Product.brand_id == brand_id)
    if min_price is not None:
        filters.append(Product.price >= min_price)
    if max_price is not None:
        filters.append(Product.price <= max_price)
    if in_stock:
        filters.append(Product.stock_quantity > 0)
    return filters


def _serialize_product(product: Product) -> ProductResponse:
    category = product.category
    brand = product.brand
    return ProductResponse(
        id=product.id,
        name=product.name,
        description=product.description,
        price=product.price,
        category=CategoryResponse(
            id=category.id,
            name=category.name,
            parent_id=category.parent_id,
        )
        if category
        else None,
        brand=BrandResponse(id=brand.id, name=brand.name, logo_url=brand.logo_url)
        if brand
        else None,
        stock_quantity=product.stock_quantity,
        rating=product.rating,
        review_count=product.review_count,
        is_active=product.is_active,
        images=[
            ProductImageResponse(id=img.id, url=img.url, is_primary=img.is_primary)
            for img in product.images
        ],
        tags=[tag.tag for tag in product.tags],
        created_at=product.created_at,
    )


@router.get("", response_model=ProductListResponse)
async def get_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: Optional[int] = None,
    brand_id: Optional[int] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    in_stock: Optional[bool] = None,
    sort_by: str = Query("created_at", pattern="^(price|rating|created_at|name)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    cache_key = make_cache_key(
        "products:list",
        {
            "page": page,
            "page_size": page_size,
            "category_id": category_id,
            "brand_id": brand_id,
            "min_price": min_price,
            "max_price": max_price,
            "in_stock": in_stock,
            "sort_by": sort_by,
            "sort_order": sort_order,
        },
    )
    redis = await get_redis()
    cached = await cache_get(redis, cache_key)
    if cached:
        return ProductListResponse.model_validate(json.loads(cached))

    filters = _build_filters(category_id, brand_id, min_price, max_price, in_stock)

    count_query = select(func.count()).select_from(Product).where(*filters)
    total = (await db.execute(count_query)).scalar_one()

    sort_column = getattr(Product, sort_by)
    order_by = desc(sort_column) if sort_order == "desc" else asc(sort_column)
    tie_breaker = desc(Product.id) if sort_order == "desc" else asc(Product.id)

    query = (
        select(Product)
        .where(*filters)
        .options(
            joinedload(Product.category),
            joinedload(Product.brand),
            selectinload(Product.images),
            selectinload(Product.tags),
        )
        .order_by(order_by, tie_breaker)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(query)
    products = result.scalars().unique().all()

    response = ProductListResponse(
        products=[_serialize_product(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )

    await cache_set(redis, cache_key, response.model_dump_json(), LIST_TTL_SECONDS)
    return response


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: int, db: AsyncSession = Depends(get_db)):
    redis = await get_redis()
    cache_key = f"products:detail:{product_id}"
    cached = await cache_get(redis, cache_key)
    if cached:
        return ProductResponse.model_validate(json.loads(cached))

    query = (
        select(Product)
        .where(Product.id == product_id)
        .options(
            joinedload(Product.category),
            joinedload(Product.brand),
            selectinload(Product.images),
            selectinload(Product.tags),
        )
    )
    result = await db.execute(query)
    product = result.scalars().unique().one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    response = _serialize_product(product)
    await cache_set(redis, cache_key, response.model_dump_json(), DETAIL_TTL_SECONDS)
    return response
