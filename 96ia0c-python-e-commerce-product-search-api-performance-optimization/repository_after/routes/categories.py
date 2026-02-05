from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Category, Product
from schemas import CategoryResponse

router = APIRouter()


@router.get("", response_model=list[CategoryResponse])
async def get_categories(db: AsyncSession = Depends(get_db)) -> list[CategoryResponse]:
    result = await db.execute(select(Category))
    categories = result.scalars().all()

    return [
        CategoryResponse(id=category.id, name=category.name, parent_id=category.parent_id)
        for category in categories
    ]


@router.get("/{category_id}/products")
async def get_category_products(
    category_id: int,
    include_subcategories: bool = True,
    db: AsyncSession = Depends(get_db),
) -> dict:
    category_ids = [category_id]

    if include_subcategories:
        result = await db.execute(select(Category))
        all_categories = result.scalars().all()

        def get_child_ids(parent_id: int) -> list[int]:
            children = [cat.id for cat in all_categories if cat.parent_id == parent_id]
            nested = []
            for child_id in children:
                nested.extend(get_child_ids(child_id))
            return children + nested

        category_ids.extend(get_child_ids(category_id))

    result = await db.execute(
        select(Product.id).where(
            Product.category_id.in_(category_ids),
            Product.is_active == True,
        )
    )
    product_ids = result.scalars().all()

    return {"products": product_ids, "total": len(product_ids)}
