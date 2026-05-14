"""
FastAPI application entry point.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.ai import router as ai_router
from app.api.products import router as products_router
from app.api.ws import router as ws_router
from app.core.config import get_settings
from app.core.database import init_db
from app.core.error_handler import (
    generic_error_handler,
    request_id_middleware,
    unified_error_handler,
    validation_error_handler,
)
from app.core.logging import get_logger
from app.core.rate_limit import limiter

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: validate config, initialize directories and DB on startup."""
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)

    if not settings.llm_api_key or settings.llm_api_key == "sk-your-key-here":
        logger.warning("config_warning", message="LLM_API_KEY not configured, AI features will use fallback mode")

    if not settings.jwt_secret_key or settings.jwt_secret_key == "change-me":
        logger.warning("config_warning", message="JWT_SECRET_KEY uses default, change in production")

    if settings.debug:
        await init_db()

    logger.info("application_startup", upload_dir=settings.upload_dir, debug=settings.debug)
    yield
    logger.info("application_shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title="DeviceJoin IoT Platform",
        description="AI-powered IoT platform - simplify device onboarding and management",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Middleware: Request ID (must be first)
    app.middleware("http")(request_id_middleware)

    # Rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Unified error handlers
    app.add_exception_handler(StarletteHTTPException, unified_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, generic_error_handler)

    # CORS - origins from config (not * in production)
    settings = get_settings()
    origins = settings.cors_origins.split(",") if settings.cors_origins != "*" else ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(products_router, prefix="/api/v1")
    app.include_router(ai_router, prefix="/api/v1")
    app.include_router(ws_router, prefix="/api/v1")

    # Prometheus metrics (observability-stack requirement)
    Instrumentator().instrument(app).expose(app, include_in_schema=False)

    @app.get("/health")
    async def health():
        """Health check with database status verification."""
        try:
            async with app.state.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            db_status = "connected"
        except Exception:
            db_status = "disconnected"
            logger.warning("health_check_db_disconnected")

        return {
            "status": "healthy" if db_status == "connected" else "degraded",
            "version": "0.1.0",
            "db": db_status,
        }

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        """Log all HTTP requests."""
        response = await call_next(request)
        logger.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            client=request.client.host if request.client else "unknown",
            request_id=getattr(request.state, "request_id", "-"),
        )
        return response

    return app


app = create_app()
app.state.engine = __import__('app.core.database', fromlist=['engine']).engine

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
