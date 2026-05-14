from __future__ import annotations

"""
Rate limiting via slowapi (production-mindset requirement #5).

Uses in-memory storage by default; swap to RedisLimiter for production.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Default: 100 requests/minute per client
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
