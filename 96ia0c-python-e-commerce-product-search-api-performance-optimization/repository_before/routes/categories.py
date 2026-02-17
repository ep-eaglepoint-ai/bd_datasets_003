from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Category, Product
from schemas import CategoryResponse
from typing import List

router = APIRouter()


@router.get("", response_model=List[CategoryResponse])
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category))
    categories = result.scalars().all()

    return [
        CategoryResponse(
            id=category.id,
            name=category.name,
            parent_id=category.parent_id
        )
        for category in categories
    ]


@router.get("/{category_id}/products")
async def get_category_products(
    category_id: int,
    include_subcategories: bool = True,
    db: AsyncSession = Depends(get_db)
):
    category_ids = [category_id]

    if include_subcategories:
        result = await db.execute(select(Category))
        all_categories = result.scalars().all()

        def get_child_ids(parent_id):
            children = []
            for cat in all_categories:
                if cat.parent_id == parent_id:
                    children.append(cat.id)
                    children.extend(get_child_ids(cat.id))
            return children

        category_ids.extend(get_child_ids(category_id))

    products = []
    for cat_id in category_ids:
        result = await db.execute(
            select(Product).where(
                Product.category_id == cat_id,
                Product.is_active == True
            )
        )
        products.extend(result.scalars().all())

    return {
        "products": [p.id for p in products],
        "total": len(products)
    }
