from __future__ import annotations

"""
JWT Authentication middleware.

Provides token generation, validation, and FastAPI dependency injection.
Uses python-jose for JWT operations and passlib for password hashing.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    """Create a new JWT access token.

    Args:
        data: Claims to encode in the token.
        expires_minutes: Token TTL. Defaults to JWT_EXPIRE_MINUTES from config.

    Returns:
        Encoded JWT string.
    """
    settings = get_settings()
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes or settings.jwt_expire_minutes)
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_token(token: str) -> Optional[dict]:
    """Verify and decode a JWT token.

    Returns:
        Decoded claims dict or None if invalid.
    """
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain, hashed)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """FastAPI dependency: extract and validate JWT from Authorization header.

    In development mode (no JWT_SECRET_KEY configured), allows unauthenticated access.
    """
    settings = get_settings()

    # Development mode: allow unauthenticated access
    if not settings.jwt_secret_key or settings.jwt_secret_key == "change-me":
        return {"sub": "anonymous", "role": "admin"}

    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    payload = verify_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return payload


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency: ensure the current user has admin role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
