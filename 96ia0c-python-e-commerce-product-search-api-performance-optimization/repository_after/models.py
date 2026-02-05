from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)

    parent = relationship("Category", remote_side=[id], backref="children")
    products = relationship("Product", back_populates="category", lazy="raise")


class Brand(Base):
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    logo_url = Column(String(500))

    products = relationship("Product", back_populates="brand", lazy="raise")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("ix_products_category_id", "category_id"),
        Index("ix_products_brand_id", "brand_id"),
        Index("ix_products_price", "price"),
        Index("ix_products_rating", "rating"),
        Index("ix_products_stock_quantity", "stock_quantity"),
        Index("ix_products_is_active", "is_active"),
        Index("ix_products_created_at", "created_at"),
        Index("ix_products_category_price", "category_id", "price"),
        Index("ix_products_brand_price", "brand_id", "price"),
        Index("ix_products_category_brand", "category_id", "brand_id"),
        Index("ix_products_active_created", "is_active", "created_at"),
        Index("ix_products_active_price", "is_active", "price"),
        Index("ix_products_active_rating", "is_active", "rating"),
        Index(
            "ix_products_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        Index(
            "ix_products_description_trgm",
            "description",
            postgresql_using="gin",
            postgresql_ops={"description": "gin_trgm_ops"},
        ),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    price = Column(Float, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"))
    brand_id = Column(Integer, ForeignKey("brands.id"))
    stock_quantity = Column(Integer, default=0)
    rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("Category", back_populates="products", lazy="raise")
    brand = relationship("Brand", back_populates="products", lazy="raise")
    images = relationship("ProductImage", back_populates="product", lazy="raise")
    tags = relationship("ProductTag", back_populates="product", lazy="raise")


class ProductImage(Base):
    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    url = Column(String(500), nullable=False)
    is_primary = Column(Boolean, default=False)

    product = relationship("Product", back_populates="images", lazy="raise")


class ProductTag(Base):
    __tablename__ = "product_tags"

    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    tag = Column(String(50), nullable=False)

    product = relationship("Product", back_populates="tags", lazy="raise")
