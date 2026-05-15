from __future__ import annotations

"""
REST API - 产品管理 & AI 解析
"""

import asyncio
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.cache import get_cache
from app.core.database import async_session_factory, get_db
from app.core.rate_limit import limiter
from app.models import AIParseSession, Command, DataPoint, Product
from app.models.schemas import (
    AIParseRequest,
    AIParseResponse,
    AIParseSessionResponse,
    AIReviewRequest,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
)
from app.services.product_studio import apply_inference_rules, get_product_studio, match_commands_to_points

router = APIRouter(prefix="/products", tags=["products"])


# ─── 手动 CRUD ───

@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
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
    await get_cache().delete("products:list")
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
    # Try cache first for unfiltered listing
    if not status and not protocol and not search:
        cached = await get_cache().get("products:list")
        if cached:
            return cached

    stmt = select(Product)
    if status:
        stmt = stmt.where(Product.status == status)
    if protocol:
        stmt = stmt.where(Product.protocol == protocol)
    if search:
        stmt = stmt.where(Product.name.ilike(f"%{search}%"))
    stmt = stmt.order_by(Product.updated_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    products = result.scalars().all()

    # Cache unfiltered listing for 60 seconds
    if not status and not protocol and not search:
        product_data = [ProductResponse.model_validate(p).model_dump() for p in products]
        await get_cache().set("products:list", product_data, ttl=60)

    return products


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(Product).where(Product.id == uuid.UUID(product_id))
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "产品不存在")
    return product


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    stmt = select(Product).where(Product.id == uuid.UUID(product_id))
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "产品不存在")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(product, key, val)
    await db.commit()
    await db.refresh(product)
    await get_cache().delete("products:list")
    return product


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    stmt = select(Product).where(Product.id == uuid.UUID(product_id))
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "产品不存在")
    await db.delete(product)
    await db.commit()
    await get_cache().delete("products:list")


# ─── AI 解析 (SSE 流式 + 轮询兜底) ───

from fastapi.responses import StreamingResponse


@router.post("/ai/parse")
@limiter.limit("5/minute")
async def ai_parse_stream(request: Request, data: AIParseRequest, db: AsyncSession = Depends(get_db)):
    """Stream AI document parsing via Server-Sent Events. Real-time progress + result."""
    import asyncio as _asyncio
    session_id = str(uuid.uuid4())

    # Create session
    session = AIParseSession(id=uuid.UUID(session_id), status="processing", uploaded_files=[{"url": f} for f in data.files])
    db.add(session)
    await db.commit()

    content = "\n\n".join(data.files or [])
    hint = data.product_hint or ""
    studio = get_product_studio()

    async def event_stream():
        db2 = async_session_factory()
        try:
            yield _sse("stage", '{"stage":"overview","progress":10,"message":"正在分析文档结构..."}')
            overview = await studio._overview_analysis(content or hint)
            if "error" in overview:
                yield _sse("error", json.dumps(overview))
                return

            yield _sse("stage", '{"stage":"extraction","progress":40,"message":"正在提取数据点位和命令..."}')
            extraction = await studio._extract_details(content or hint, overview, hint)

            yield _sse("stage", '{"stage":"inference","progress":70,"message":"正在推断补全缺失信息..."}')
            extraction["data_points"] = apply_inference_rules(extraction.get("data_points", []))
            extraction["commands"] = match_commands_to_points(extraction.get("commands", []), extraction.get("data_points", []))

            # Save
            stmt = select(AIParseSession).where(AIParseSession.id == uuid.UUID(session_id))
            r = await db2.execute(stmt)
            ses = r.scalar_one_or_none()
            if ses:
                ses.status = "completed"
                ses.raw_analysis = {"overview": overview, "extraction": extraction}
                await db2.commit()

            result = {"session_id": session_id, "status": "completed",
                       "product": extraction.get("product"),
                       "data_points": extraction.get("data_points", []),
                       "commands": extraction.get("commands", []),
                       "uncertainties": extraction.get("uncertainties", []),
                       "overall_confidence": extraction.get("overall_confidence", 0.8)}
            yield _sse("result", json.dumps(result, ensure_ascii=False))
            yield _sse("done", '{"message":"解析完成"}')

        except Exception as e:
            stmt = select(AIParseSession).where(AIParseSession.id == uuid.UUID(session_id))
            r = await db2.execute(stmt)
            ses = r.scalar_one_or_none()
            if ses:
                ses.status = "failed"
                ses.raw_analysis = {"error": str(e)}
                await db2.commit()
            yield _sse("error", json.dumps({"message": str(e)[:200]}))
        finally:
            await db2.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"X-Session-Id": session_id, "Cache-Control": "no-cache", "Connection": "keep-alive"})


def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


@router.get("/ai/parse/{session_id}", response_model=AIParseSessionResponse)
async def ai_parse_poll(session_id: str, db: AsyncSession = Depends(get_db)):
    """Fallback: poll session status if SSE connection dropped."""
    stmt = select(AIParseSession).where(AIParseSession.id == uuid.UUID(session_id))
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "解析会话不存在")

    resp = AIParseSessionResponse(session_id=str(session.id), status=session.status or "processing", stage="", progress=0)
    if session.status == "completed" and session.raw_analysis:
        e = session.raw_analysis.get("extraction", {})
        resp.product = e.get("product")
        resp.data_points = e.get("data_points", [])
        resp.commands = e.get("commands", [])
        resp.uncertainties = e.get("uncertainties", [])
        resp.overall_confidence = e.get("overall_confidence", 0.0)
    elif session.status == "failed":
        resp.error = str(session.raw_analysis.get("error", "Unknown")) if session.raw_analysis else ""
    return resp


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
