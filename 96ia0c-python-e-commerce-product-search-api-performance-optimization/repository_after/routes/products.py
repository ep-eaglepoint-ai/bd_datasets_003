import json
import base64
from typing import Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, select, tuple_
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


def _encode_cursor(value: Any, product_id: int) -> str:
    if isinstance(value, datetime):
        value = value.isoformat()
    return base64.b64encode(f"{value},{product_id}".encode()).decode()


def _decode_cursor(cursor: str, sort_type: type) -> tuple[Any, int]:
    try:
        decoded = base64.b64decode(cursor).decode().split(",")
        val = decoded[0]
        pid = int(decoded[1])
        if sort_type is int:
            val = int(val)
        elif sort_type is float:
            val = float(val)
        elif sort_type is datetime:
            val = datetime.fromisoformat(val)
        return val, pid
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cursor")


@router.get("", response_model=ProductListResponse)
async def get_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = None,
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
            "cursor": cursor,
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
    )

    if cursor:
        sort_type = getattr(Product, sort_by).type.python_type
        cursor_val, cursor_id = _decode_cursor(cursor, sort_type)
        if sort_order == "desc":
            query = query.where(tuple_(sort_column, Product.id) < (cursor_val, cursor_id))
        else:
            query = query.where(tuple_(sort_column, Product.id) > (cursor_val, cursor_id))
        query = query.limit(page_size)
    else:
        query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    products = result.scalars().unique().all()

    next_cursor = None
    if products and len(products) == page_size:
        last_product = products[-1]
        next_cursor = _encode_cursor(getattr(last_product, sort_by), last_product.id)
    
    # If we used cursor, we might want to skip next_cursor if we're at the end. 
    # But usually we return it until no results. 
    # With limit(page_size), if we got page_size items, there *might* be more.

    response = ProductListResponse(
        products=[_serialize_product(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
        next_cursor=next_cursor,
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
