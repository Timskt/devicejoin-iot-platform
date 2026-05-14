"""
数据库连接 & 会话管理
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.models import Base

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    """Create all tables. Swallows connection errors gracefully."""
    from app.core.logging import get_logger
    log = get_logger(__name__)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as e:
        log.warning("init_db_skipped", reason=str(e)[:100])


async def get_db() -> AsyncSession:
    """FastAPI 依赖注入"""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
