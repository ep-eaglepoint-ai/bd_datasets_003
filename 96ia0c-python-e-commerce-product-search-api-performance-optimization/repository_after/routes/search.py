import json
import base64
from typing import Any, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from cache import SEARCH_TTL_SECONDS, cache_get, cache_set, make_cache_key
from database import get_db, get_redis
from models import Product
from schemas import (
    BrandResponse,
    CategoryResponse,
    ProductImageResponse,
    ProductListResponse,
    ProductResponse,
    SearchFilters,
)

router = APIRouter()


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


def _apply_filters(
    query,
    category_id: Optional[int],
    brand_id: Optional[int],
    min_price: Optional[float],
    max_price: Optional[float],
    in_stock: Optional[bool],
    min_rating: Optional[float],
):
    if category_id:
        query = query.where(Product.category_id == category_id)
    if brand_id:
        query = query.where(Product.brand_id == brand_id)
    if min_price is not None:
        query = query.where(Product.price >= min_price)
    if max_price is not None:
        query = query.where(Product.price <= max_price)
    if in_stock:
        query = query.where(Product.stock_quantity > 0)
    if min_rating is not None:
        query = query.where(Product.rating >= min_rating)
    return query


@router.get("", response_model=ProductListResponse)
async def search_products(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = None,
    category_id: Optional[int] = None,
    brand_id: Optional[int] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    in_stock: Optional[bool] = None,
    min_rating: Optional[float] = None,
    sort_by: str = Query("relevance", pattern="^(price|rating|relevance|name)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    cache_key = make_cache_key(
        "products:search",
        {
            "q": q,
            "page": page,
            "page_size": page_size,
            "cursor": cursor,
            "category_id": category_id,
            "brand_id": brand_id,
            "min_price": min_price,
            "max_price": max_price,
            "in_stock": in_stock,
            "min_rating": min_rating,
            "sort_by": sort_by,
            "sort_order": sort_order,
        },
    )
    redis = await get_redis()
    cached = await cache_get(redis, cache_key)
    if cached:
        return ProductListResponse.model_validate(json.loads(cached))

    similarity_name = func.similarity(Product.name, q)
    similarity_desc = func.similarity(func.coalesce(Product.description, ""), q)
    relevance_score = func.greatest(similarity_name, similarity_desc)

    search_predicate = or_(
        Product.name.op("%")(q),
        func.coalesce(Product.description, "").op("%")(q),
    )

    if sort_by == "relevance":
        base_query = select(Product, relevance_score).where(Product.is_active == True).where(search_predicate)
        sort_column_expr = relevance_score
        sort_type = float
        order_by = desc(relevance_score)
        tie_breaker = desc(Product.id)
    else:
        base_query = select(Product).where(Product.is_active == True).where(search_predicate)
        sort_column_expr = getattr(Product, sort_by)
        sort_type = getattr(Product, sort_by).type.python_type
        order_by = desc(sort_column_expr) if sort_order == "desc" else asc(sort_column_expr)
        tie_breaker = desc(Product.id) if sort_order == "desc" else asc(Product.id)

    base_query = _apply_filters(
        base_query,
        category_id,
        brand_id,
        min_price,
        max_price,
        in_stock,
        min_rating,
    )

    count_query = select(func.count()).select_from(Product).where(
        Product.is_active == True,
        search_predicate,
    )
    count_query = _apply_filters(
        count_query,
        category_id,
        brand_id,
        min_price,
        max_price,
        in_stock,
        min_rating,
    )
    total = (await db.execute(count_query)).scalar_one()

    query = (
        base_query.options(
            joinedload(Product.category),
            joinedload(Product.brand),
            selectinload(Product.images),
            selectinload(Product.tags),
        )
        .order_by(order_by, tie_breaker)
    )

    if cursor:
        cursor_val, cursor_id = _decode_cursor(cursor, sort_type)
        if sort_by == "relevance" or sort_order == "desc":
            query = query.where(tuple_(sort_column_expr, Product.id) < (cursor_val, cursor_id))
        else:
            query = query.where(tuple_(sort_column_expr, Product.id) > (cursor_val, cursor_id))
        query = query.limit(page_size)
    else:
        query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    
    products = []
    last_val = None
    
    if sort_by == "relevance":
        rows = result.unique().all()
        for row in rows:
            products.append(row[0]) # Product
            last_val = row[1]       # Score
    else:
        products = result.scalars().unique().all()
        if products:
             last_val = getattr(products[-1], sort_by)

    next_cursor = None
    if products and len(products) == page_size:
        last_product = products[-1]
        next_cursor = _encode_cursor(last_val, last_product.id)

    response = ProductListResponse(
        products=[_serialize_product(product) for product in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
        next_cursor=next_cursor,
    )

    await cache_set(redis, cache_key, response.model_dump_json(), SEARCH_TTL_SECONDS)
    return response

@router.post("/filters", response_model=ProductListResponse)
async def search_with_filters(
    filters: SearchFilters,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    cache_key = make_cache_key(
        "products:search",
        {
            "filters": filters.model_dump(),
            "page": page,
            "page_size": page_size,
        },
    )
    redis = await get_redis()
    cached = await cache_get(redis, cache_key)
    if cached:
        return ProductListResponse.model_validate(json.loads(cached))

    base_query = select(Product).where(Product.is_active == True)

    base_query = select(Product).where(Product.is_active == True)

    if filters.query:
        similarity_name = func.similarity(Product.name, filters.query)
        similarity_desc = func.similarity(func.coalesce(Product.description, ""), filters.query)
        relevance_score = func.greatest(similarity_name, similarity_desc)
        search_predicate = or_(
            Product.name.op("%")(filters.query),
            func.coalesce(Product.description, "").op("%")(filters.query),
        )
        base_query = base_query.where(search_predicate)
    else:
        relevance_score = None

    base_query = _apply_filters(
        base_query,
        filters.category_id,
        filters.brand_id,
        filters.min_price,
        filters.max_price,
        filters.in_stock,
        filters.min_rating,
    )

    count_query = select(func.count()).select_from(Product).where(Product.is_active == True)
    if filters.query:
        count_query = count_query.where(search_predicate)
    count_query = _apply_filters(
        count_query,
        filters.category_id,
        filters.brand_id,
        filters.min_price,
        filters.max_price,
        filters.in_stock,
        filters.min_rating,
    )
    total = (await db.execute(count_query)).scalar_one()

    if relevance_score is not None:
        order_by = desc(relevance_score)
        tie_breaker = desc(Product.id)
    else:
        order_by = desc(Product.created_at)
        tie_breaker = desc(Product.id)

    query = (
        base_query.options(
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

    await cache_set(redis, cache_key, response.model_dump_json(), SEARCH_TTL_SECONDS)
    return response
