"""
Product persistence service - handles product creation from AI review data.

Single Responsibility: only creates products from structured review data.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import (
    AIParseSession,
    Command,
    CommandPointMapping,
    ConfidenceLevel,
    DataPoint,
    Product,
    ProductStatus,
)

logger = get_logger(__name__)


async def create_product_from_review(review_data: dict, session_id: str, db: AsyncSession) -> Product:
    """Create a Product with DataPoints, Commands, and CommandPointMappings from AI review data.

    Args:
        review_data: Validated review data with product, data_points, commands keys.
        session_id: The AI parse session ID for tracking.
        db: Async database session.

    Returns:
        The newly created Product instance.
    """
    product_data = review_data.get("product", {})
    product = Product(
        id=uuid.uuid4(),
        name=product_data.get("name", "未命名产品"),
        model=product_data.get("model", "unknown"),
        manufacturer=product_data.get("manufacturer"),
        protocol=product_data.get("protocol", "modbus_rtu"),
        description=product_data.get("description"),
        tags=product_data.get("tags", []),
        status=ProductStatus.ACTIVE.value,
        ai_confidence=1.0,
    )
    db.add(product)

    point_id_map: dict[str, str] = {}
    for dp_data in review_data.get("data_points", []):
        dp_id = str(uuid.uuid4())
        point = DataPoint(
            id=uuid.UUID(dp_id),
            product_id=product.id,
            identifier=dp_data.get("identifier", ""),
            name=dp_data.get("name", ""),
            description=dp_data.get("description"),
            category=dp_data.get("category"),
            register=dp_data.get("register"),
            data_type=dp_data.get("data_type", "float32"),
            unit=dp_data.get("unit"),
            access=dp_data.get("access", "R"),
            scale=dp_data.get("scale", 1.0),
            offset=dp_data.get("offset", 0.0),
            precision=dp_data.get("precision", 1),
            range_min=dp_data.get("range_min"),
            range_max=dp_data.get("range_max"),
            enum_values=dp_data.get("enum_values"),
            ai_confidence=dp_data.get("confidence", ConfidenceLevel.CERTAIN.value),
            needs_review=False,
        )
        db.add(point)
        point_id_map[dp_data.get("identifier", "")] = dp_id

    for cmd_data in review_data.get("commands", []):
        cmd_id = str(uuid.uuid4())
        command = Command(
            id=uuid.UUID(cmd_id),
            product_id=product.id,
            identifier=cmd_data.get("identifier", ""),
            name=cmd_data.get("name", ""),
            description=cmd_data.get("description"),
            method=cmd_data.get("method"),
            parameters=cmd_data.get("parameters", []),
            ai_confidence=cmd_data.get("confidence", ConfidenceLevel.CERTAIN.value),
            needs_review=False,
        )
        db.add(command)

        for dp_identifier in cmd_data.get("related_point_ids", []):
            if dp_identifier in point_id_map:
                mapping = CommandPointMapping(
                    id=uuid.uuid4(),
                    command_id=command.id,
                    point_id=uuid.UUID(point_id_map[dp_identifier]),
                    relation="WRITE_TO",
                )
                db.add(mapping)

    stmt = select(AIParseSession).where(AIParseSession.id == uuid.UUID(session_id))
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if session:
        session.status = "confirmed"
        session.confirmed_product_id = product.id

    await db.commit()
    await db.refresh(product)
    logger.info("product_created", product_id=str(product.id), name=product.name)
    return product
