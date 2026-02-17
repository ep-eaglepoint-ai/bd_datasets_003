from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from database import get_db
from models import Product, Category, Brand, ProductImage, ProductTag
from schemas import ProductResponse, ProductListResponse, CategoryResponse, BrandResponse, ProductImageResponse, SearchFilters
from typing import Optional

router = APIRouter()


@router.get("", response_model=ProductListResponse)
async def search_products(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: Optional[int] = None,
    brand_id: Optional[int] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    in_stock: Optional[bool] = None,
    min_rating: Optional[float] = None,
    sort_by: str = Query("relevance", regex="^(price|rating|relevance|name)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db)
):
    query = select(Product).where(Product.is_active == True)

    search_term = f"%{q}%"
    query = query.where(
        or_(
            Product.name.ilike(search_term),
            Product.description.ilike(search_term)
        )
    )

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

    result = await db.execute(query)
    all_products = result.scalars().all()
    total = len(all_products)

    if sort_by != "relevance":
        sort_column = getattr(Product, sort_by)
        if sort_order == "desc":
            query = query.order_by(sort_column.desc())
        else:
            query = query.order_by(sort_column.asc())

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    products = result.scalars().all()

    product_responses = []
    for product in products:
        category_result = await db.execute(
            select(Category).where(Category.id == product.category_id)
        )
        category = category_result.scalar_one_or_none()

        brand_result = await db.execute(
            select(Brand).where(Brand.id == product.brand_id)
        )
        brand = brand_result.scalar_one_or_none()

        images_result = await db.execute(
            select(ProductImage).where(ProductImage.product_id == product.id)
        )
        images = images_result.scalars().all()

        tags_result = await db.execute(
            select(ProductTag).where(ProductTag.product_id == product.id)
        )
        tags = tags_result.scalars().all()

        product_responses.append(ProductResponse(
            id=product.id,
            name=product.name,
            description=product.description,
            price=product.price,
            category=CategoryResponse(
                id=category.id,
                name=category.name,
                parent_id=category.parent_id
            ) if category else None,
            brand=BrandResponse(
                id=brand.id,
                name=brand.name,
                logo_url=brand.logo_url
            ) if brand else None,
            stock_quantity=product.stock_quantity,
            rating=product.rating,
            review_count=product.review_count,
            is_active=product.is_active,
            images=[ProductImageResponse(
                id=img.id,
                url=img.url,
                is_primary=img.is_primary
            ) for img in images],
            tags=[tag.tag for tag in tags],
            created_at=product.created_at
        ))

    return ProductListResponse(
        products=product_responses,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )


@router.post("/filters", response_model=ProductListResponse)
async def search_with_filters(
    filters: SearchFilters,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    query = select(Product).where(Product.is_active == True)

    if filters.query:
        search_term = f"%{filters.query}%"
        query = query.where(
            or_(
                Product.name.ilike(search_term),
                Product.description.ilike(search_term)
            )
        )

    if filters.category_id:
        query = query.where(Product.category_id == filters.category_id)
    if filters.brand_id:
        query = query.where(Product.brand_id == filters.brand_id)
    if filters.min_price is not None:
        query = query.where(Product.price >= filters.min_price)
    if filters.max_price is not None:
        query = query.where(Product.price <= filters.max_price)
    if filters.in_stock:
        query = query.where(Product.stock_quantity > 0)
    if filters.min_rating is not None:
        query = query.where(Product.rating >= filters.min_rating)

    result = await db.execute(query)
    all_products = result.scalars().all()
    total = len(all_products)

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    products = result.scalars().all()

    product_responses = []
    for product in products:
        category_result = await db.execute(
            select(Category).where(Category.id == product.category_id)
        )
        category = category_result.scalar_one_or_none()

        brand_result = await db.execute(
            select(Brand).where(Brand.id == product.brand_id)
        )
        brand = brand_result.scalar_one_or_none()

        images_result = await db.execute(
            select(ProductImage).where(ProductImage.product_id == product.id)
        )
        images = images_result.scalars().all()

        tags_result = await db.execute(
            select(ProductTag).where(ProductTag.product_id == product.id)
        )
        tags = tags_result.scalars().all()

        product_responses.append(ProductResponse(
            id=product.id,
            name=product.name,
            description=product.description,
            price=product.price,
            category=CategoryResponse(
                id=category.id,
                name=category.name,
                parent_id=category.parent_id
            ) if category else None,
            brand=BrandResponse(
                id=brand.id,
                name=brand.name,
                logo_url=brand.logo_url
            ) if brand else None,
            stock_quantity=product.stock_quantity,
            rating=product.rating,
            review_count=product.review_count,
            is_active=product.is_active,
            images=[ProductImageResponse(
                id=img.id,
                url=img.url,
                is_primary=img.is_primary
            ) for img in images],
            tags=[tag.tag for tag in tags],
            created_at=product.created_at
        ))

    return ProductListResponse(
        products=product_responses,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )
