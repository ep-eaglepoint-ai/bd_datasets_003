from __future__ import annotations

from typing import Optional


class APIError(Exception):
    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response_body: Optional[dict] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.response_body = response_body


class ValidationError(Exception):
    def __init__(
        self,
        message: str,
        field_errors: Optional[dict] = None,
        response_body: Optional[dict] = None,
    ):
        super().__init__(message)
        self.message = message
        self.field_errors = field_errors
        self.response_body = response_body


class RateLimitError(Exception):
    def __init__(
        self,
        message: str,
        retry_after: Optional[int] = None,
        response_body: Optional[dict] = None,
    ):
        super().__init__(message)
        self.message = message
        self.retry_after = retry_after
        self.response_body = response_body


class CircuitBreakerOpen(Exception):
    def __init__(self, service_name: str):
        super().__init__(f"Circuit breaker open for {service_name}")
        self.service_name = service_name


class TimeoutError(Exception):
    def __init__(self, message: str, timeout_seconds: float):
        super().__init__(message)
        self.message = message
        self.timeout_seconds = timeout_seconds
