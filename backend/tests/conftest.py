"""
测试配置 & 共享 fixtures
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Base

# 使用 SQLite 内存数据库进行测试
TEST_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

# 覆盖环境变量，避免 OpenAI 报错
os.environ.setdefault("OPENAI_API_KEY", "test-key-placeholder")

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db():
    async with TestSession() as session:
        yield session
        await session.rollback()


@pytest.fixture
def client():
    """覆盖数据库 URL 的测试客户端"""
    from app.core.config import get_settings
    from app.core.database import get_db
    from app.main import app

    # 覆盖数据库连接
    settings = get_settings()
    old_url = settings.database_url
    settings.database_url = TEST_DATABASE_URL

    # 重建 engine
    from app.core.database import create_async_engine
    test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    test_session = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with test_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    client = TestClient(app)
    yield client

    app.dependency_overrides.clear()
    settings.database_url = old_url
