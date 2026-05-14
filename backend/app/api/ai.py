"""
REST API - AI 智能模块 (调试、规则、数据探索、面板、模拟)
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Dashboard, DataPoint, Device, Product, Rule
from app.models.schemas import (
    DashboardCreate,
    DashboardNLRequest,
    DataQueryRequest,
    DataQueryResponse,
    DebugRequest,
    DebugResponse,
    RuleCreate,
    RuleNLRequest,
    SimulatorStartRequest,
)
from app.services.dashboard_builder import get_dashboard_builder
from app.services.data_explorer import get_data_explorer
from app.services.debug_assistant import get_debug_assistant
from app.services.rule_composer import get_rule_composer
from app.services.simulator import get_simulator

router = APIRouter(prefix="/ai", tags=["ai"])


# ─── 调试助手 ───

@router.post("/debug", response_model=DebugResponse)
async def ai_debug(data: DebugRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(Device).where(Device.id == uuid.UUID(data.device_id))
    result = await db.execute(stmt)
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(404, "设备不存在")

    # 获取产品信息
    product_stmt = select(Product).where(Product.id == device.product_id)
    product_result = await db.execute(product_stmt)
    product = product_result.scalar_one_or_none()

    # 获取点位
    points_stmt = select(DataPoint).where(DataPoint.product_id == device.product_id)
    points_result = await db.execute(points_stmt)
    points = points_result.scalars().all()

    assistant = get_debug_assistant()
    result = await assistant.diagnose(
        device_info={
            "name": device.name,
            "device_id": device.device_id,
            "status": device.status,
            "connection_info": device.connection_info,
            "product": product.name if product else "未知",
        },
        product_points=[{"name": p.name, "identifier": p.identifier,
                         "register": p.register, "data_type": p.data_type} for p in points],
        logs=data.logs or [],
        context=data.context or "",
    )
    return DebugResponse(**result)


# ─── 规则编排 ───

@router.post("/rules/compose")
async def ai_compose_rule(data: RuleNLRequest, db: AsyncSession = Depends(get_db)):
    # 获取可用点位
    points = []
    product_ids = data.context_product_ids or []
    if product_ids:
        for pid in product_ids:
            stmt = select(DataPoint).where(DataPoint.product_id == uuid.UUID(pid))
            result = await db.execute(stmt)
            for p in result.scalars():
                points.append({"identifier": p.identifier, "name": p.name, "data_type": p.data_type, "unit": p.unit})
    else:
        stmt = select(DataPoint).limit(100)
        result = await db.execute(stmt)
        for p in result.scalars():
            points.append({"identifier": p.identifier, "name": p.name, "data_type": p.data_type, "unit": p.unit})

    composer = get_rule_composer()
    return await composer.compose(data.text, points, [])


@router.post("/rules", status_code=201)
async def create_rule(data: RuleCreate, db: AsyncSession = Depends(get_db)):
    rule = Rule(
        id=uuid.uuid4(),
        name=data.name,
        rule_type=data.rule_type,
        description=data.description,
        trigger=data.trigger,
        actions=data.actions,
        scope=data.scope or {},
        ai_generated=bool(data.natural_language),
        ai_prompt=data.natural_language,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


# ─── 数据探索 ───

@router.post("/data/explore", response_model=DataQueryResponse)
async def ai_explore_data(data: DataQueryRequest, db: AsyncSession = Depends(get_db)):
    sources = []
    if data.device_ids:
        for did in data.device_ids:
            stmt = select(Device).where(Device.id == uuid.UUID(did))
            result = await db.execute(stmt)
            device = result.scalar_one_or_none()
            if device:
                pts = await db.execute(select(DataPoint).where(DataPoint.product_id == device.product_id))
                sources.append({
                    "device": device.name,
                    "points": [{"identifier": p.identifier, "name": p.name, "unit": p.unit}
                              for p in pts.scalars().all()],
                })

    explorer = get_data_explorer()
    result = await explorer.explore(data.text, sources)
    return DataQueryResponse(
        text=data.text,
        sql=result.get("sql"),
        data=[result],
        visualization=result.get("visualization"),
        explanation=result.get("explanation", ""),
    )


# ─── 面板构建 ───

@router.post("/dashboards/build")
async def ai_build_dashboard(data: DashboardNLRequest, db: AsyncSession = Depends(get_db)):
    all_points = []
    for pid in data.product_ids:
        stmt = select(DataPoint).where(DataPoint.product_id == uuid.UUID(pid))
        result = await db.execute(stmt)
        for p in result.scalars():
            all_points.append({
                "id": str(p.id),
                "identifier": p.identifier,
                "name": p.name,
                "data_type": p.data_type,
                "unit": p.unit,
                "range_min": p.range_min,
                "range_max": p.range_max,
                "category": p.category,
            })

    builder = get_dashboard_builder()
    return await builder.build(data.text, all_points)


@router.post("/dashboards", status_code=201)
async def create_dashboard(data: DashboardCreate, db: AsyncSession = Depends(get_db)):
    dashboard = Dashboard(
        id=uuid.uuid4(),
        name=data.name,
        description=data.description,
        layout=data.layout,
        ai_generated=data.ai_generated,
        ai_prompt=data.ai_prompt,
    )
    db.add(dashboard)
    await db.commit()
    await db.refresh(dashboard)
    return dashboard


# ─── 模拟器 ───

@router.post("/simulator/start")
async def ai_start_simulation(data: SimulatorStartRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(DataPoint).where(DataPoint.product_id == uuid.UUID(data.product_id))
    result = await db.execute(stmt)
    points = result.scalars().all()

    simulator = get_simulator()
    pattern = await simulator.generate_pattern(
        points=[{"identifier": p.identifier, "name": p.name, "data_type": p.data_type,
                 "range_min": p.range_min or 0, "range_max": p.range_max or 100,
                 "unit": p.unit} for p in points],
        device_count=data.device_count,
        interval_seconds=data.interval_seconds,
        duration_seconds=data.duration_seconds,
        anomaly_probability=data.anomaly_probability,
    )
    return {"simulation_id": str(uuid.uuid4()), "pattern": pattern, "status": "started"}
