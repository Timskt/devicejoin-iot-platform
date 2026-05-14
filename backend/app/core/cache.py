"""
Redis caching layer for frequently accessed data.

Uses redis-py for async cache operations.
Falls back to no-op cache when Redis is unavailable.
"""

import json
from collections.abc import Coroutine
from functools import wraps
from typing import Any, Callable, Optional

from app.core.logging import get_logger

logger = get_logger(__name__)

try:
    import redis.asyncio as aioredis
    REDIS_AVAILABLE = True
except ImportError:
    aioredis = None  # type: ignore
    REDIS_AVAILABLE = False


class CacheManager:
    """Async Redis cache with fallback to no-op."""

    def __init__(self, redis_url: str = ""):
        self._redis: Optional[aioredis.Redis] = None  # type: ignore
        self._url = redis_url
        self._available = REDIS_AVAILABLE

    async def _get_client(self) -> Optional[aioredis.Redis]:  # type: ignore
        if not self._available or not self._url:
            return None
        if self._redis is None:
            try:
                self._redis = aioredis.from_url(self._url, decode_responses=True)  # type: ignore
                await self._redis.ping()
            except Exception as e:
                logger.warning("redis_connect_failed", error=str(e))
                self._available = False
                return None
        return self._redis

    async def get(self, key: str) -> Optional[Any]:
        client = await self._get_client()
        if client is None:
            return None
        try:
            value = await client.get(key)
            return json.loads(value) if value else None
        except Exception:
            return None

    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        client = await self._get_client()
        if client is None:
            return False
        try:
            await client.setex(key, ttl, json.dumps(value, default=str))
            return True
        except Exception:
            return False

    async def delete(self, key: str) -> bool:
        client = await self._get_client()
        if client is None:
            return False
        try:
            await client.delete(key)
            return True
        except Exception:
            return False


_cache_instance: Optional[CacheManager] = None


def get_cache() -> CacheManager:
    global _cache_instance
    if _cache_instance is None:
        from app.core.config import get_settings
        _cache_instance = CacheManager(get_settings().redis_url)
    return _cache_instance


def cached(ttl: int = 300, prefix: str = ""):
    """Decorator to cache async function results in Redis.

    Args:
        ttl: Cache TTL in seconds.
        prefix: Key prefix for namespacing.
    """
    def decorator(func: Callable[..., Coroutine[Any, Any, Any]]):
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            cache = get_cache()
            key = f"{prefix}{func.__name__}:{hash(str(args) + str(kwargs))}"
            cached_value = await cache.get(key)
            if cached_value is not None:
                logger.debug("cache_hit", key=key)
                return cached_value
            result = await func(*args, **kwargs)
            await cache.set(key, result, ttl)
            return result
        return wrapper
    return decorator
