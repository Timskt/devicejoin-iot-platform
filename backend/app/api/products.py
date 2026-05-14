from __future__ import annotations

"""
REST API - 产品管理 & AI 解析
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models import Command, DataPoint, Product
from app.models.schemas import (
    AIParseRequest,
    AIParseResponse,
    AIReviewRequest,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
)
from app.services.product_studio import get_product_studio

router = APIRouter(prefix="/products", tags=["products"])


# ─── 手动 CRUD ───

@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(data: ProductCreate, db: AsyncSession = Depends(get_db)):
    product = Product(
        id=uuid.uuid4(),
        name=data.name,
        model=data.model,
        manufacturer=data.manufacturer,
        protocol=data.protocol,
        description=data.description,
        tags=data.tags,
    )
    db.add(product)
    for dp in data.data_points:
        db.add(DataPoint(product_id=product.id, **dp.model_dump()))
    for cmd in data.commands:
        cmd_data = cmd.model_dump()
        cmd_data.pop("related_point_ids", None)
        db.add(Command(product_id=product.id, **cmd_data))
    await db.commit()
    await db.refresh(product)
    return product


@router.get("", response_model=list[ProductResponse])
async def list_products(
    status: Optional[str] = None,
    protocol: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Product)
    if status:
        stmt = stmt.where(Product.status == status)
    if protocol:
        stmt = stmt.where(Product.protocol == protocol)
    if search:
        stmt = stmt.where(Product.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(Product.updated_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).where(Product.id == uuid.UUID(product_id))
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "产品不存在")
    return product


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, data: ProductUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).where(Product.id == uuid.UUID(product_id))
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "产品不存在")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(product, key, val)
    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
async def delete_product(product_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).where(Product.id == uuid.UUID(product_id))
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "产品不存在")
    await db.delete(product)
    await db.commit()


# ─── AI 解析 ───

@router.post("/ai/parse", response_model=AIParseResponse)
@limiter.limit("5/minute")
async def ai_parse_documents(request: Request, data: AIParseRequest, db: AsyncSession = Depends(get_db)):
    studio = get_product_studio()
    result = await studio.parse_documents(
        files=data.files,
        product_hint=data.product_hint or "",
        db=db,
    )
    return result


@router.post("/ai/review", response_model=ProductResponse, status_code=201)
async def ai_review_and_create(data: AIReviewRequest, db: AsyncSession = Depends(get_db)):
    studio = get_product_studio()
    product = await studio.review_and_create(data, db)
    return product


# ─── 点位子路由 ───

@router.get("/{product_id}/points")
async def list_points(product_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(DataPoint).where(DataPoint.product_id == uuid.UUID(product_id))
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{product_id}/commands")
async def list_commands(product_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Command).where(Command.product_id == uuid.UUID(product_id))
    result = await db.execute(stmt)
    return result.scalars().all()
