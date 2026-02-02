from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    parent_id: Optional[int] = None


class BrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    logo_url: Optional[str] = None


class ProductImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    is_primary: bool


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    price: float
    category: Optional[CategoryResponse] = None
    brand: Optional[BrandResponse] = None
    stock_quantity: int
    rating: float
    review_count: int
    is_active: bool
    images: List[ProductImageResponse] = []
    tags: List[str] = []
    created_at: datetime


class ProductListResponse(BaseModel):
    products: List[ProductResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class SearchFilters(BaseModel):
    query: Optional[str] = None
    category_id: Optional[int] = None
    brand_id: Optional[int] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    in_stock: Optional[bool] = None
    min_rating: Optional[float] = None
