"""
Unified error handling and request ID middleware.

All errors return consistent JSON: {"error": {"code": "...", "message": "...", "request_id": "..."}}
"""

import uuid

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger(__name__)


async def request_id_middleware(request: Request, call_next):
    """Inject X-Request-ID header for distributed tracing."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


async def unified_error_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.warning(
        "http_error",
        request_id=request_id,
        status_code=exc.status_code,
        detail=str(exc.detail),
        path=request.url.path,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "http_error",
                "message": str(exc.detail),
                "request_id": request_id,
            }
        },
    )


async def validation_error_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", "unknown")
    errors = exc.errors()
    logger.warning(
        "validation_error",
        request_id=request_id,
        errors=errors,
        path=request.url.path,
    )
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Request validation failed",
                "request_id": request_id,
                "details": errors,
            }
        },
    )


async def generic_error_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(
        "internal_error",
        request_id=request_id,
        error=str(exc),
        path=request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "An unexpected error occurred" if not __import__('os').environ.get("DEBUG") else str(exc),
                "request_id": request_id,
            }
        },
    )
