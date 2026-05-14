"""
LLM Circuit Breaker pattern.

Protects against cascading failures when the LLM API is unavailable.
After 3 consecutive failures, the circuit opens and fast-fails for 30 seconds.
"""

import time
from collections.abc import Coroutine
from enum import Enum
from functools import wraps
from typing import Any, Callable

from app.core.logging import get_logger

logger = get_logger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"         # Normal operation
    OPEN = "open"             # Failing fast
    HALF_OPEN = "half_open"   # Testing if recovered


class CircuitBreaker:
    """Circuit breaker for external API calls."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 1,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: float = 0.0
        self.half_open_calls = 0

    async def call(self, func: Callable[..., Coroutine[Any, Any, Any]], *args: Any, **kwargs: Any) -> Any:
        """Execute a function through the circuit breaker."""
        if self.state == CircuitState.OPEN:
            if time.monotonic() - self.last_failure_time >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                logger.info("circuit_half_open", name=self.name)
            else:
                logger.warning("circuit_open_fast_fail", name=self.name)
                raise CircuitBreakerOpenError(f"Circuit breaker '{self.name}' is OPEN")

        if self.state == CircuitState.HALF_OPEN:
            if self.half_open_calls >= self.half_open_max_calls:
                raise CircuitBreakerOpenError(f"Circuit breaker '{self.name}' is HALF_OPEN (max calls reached)")

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure(e)
            raise

    def _on_success(self) -> None:
        if self.state == CircuitState.HALF_OPEN:
            logger.info("circuit_closed", name=self.name)
        self.state = CircuitState.CLOSED
        self.failure_count = 0

    def _on_failure(self, error: Exception) -> None:
        self.failure_count += 1
        self.last_failure_time = time.monotonic()

        if self.state == CircuitState.HALF_OPEN or self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.error("circuit_opened", name=self.name, failures=self.failure_count, error=str(error))
        else:
            logger.warning("circuit_failure", name=self.name, failures=self.failure_count, error=str(error))


class CircuitBreakerOpenError(Exception):
    """Raised when a circuit breaker is open and fast-failing."""
    pass


# Global circuit breaker for LLM calls
llm_circuit = CircuitBreaker("llm_api", failure_threshold=3, recovery_timeout=30.0)


def with_llm_circuit_breaker(func: Callable[..., Coroutine[Any, Any, Any]]) -> Callable[..., Coroutine[Any, Any, Any]]:
    """Decorator to wrap LLM calls with circuit breaker protection."""
    @wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await llm_circuit.call(func, *args, **kwargs)
        except CircuitBreakerOpenError:
            return _fallback_response()
    return wrapper


def _fallback_response() -> dict[str, Any]:
    """Return a graceful fallback when LLM is unavailable."""
    return {
        "error": "llm_unavailable",
        "message": "AI 服务暂时不可用，请稍后重试。您仍可以手动配置产品。",
        "suggestion": "在此期间您可以使用手动创建功能。",
    }
