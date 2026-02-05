from __future__ import annotations

import json
import logging
from typing import Any, List, Optional

import httpx
from pydantic import ValidationError as PydanticValidationError

from .circuit_breaker import CircuitBreaker, CircuitState
from .exceptions import (
    APIError,
    CircuitBreakerOpen,
    RateLimitError,
    TimeoutError,
    ValidationError,
)
from .models import (
    CreatePaymentRequest,
    CreateUserRequest,
    ListUsersResponse,
    Notification,
    Payment,
    RefundRequest,
    SendNotificationRequest,
    Transaction,
    UpdateUserRequest,
    User,
)
from .rate_limiter import RateLimiter
from .retry import RetryConfig, with_retry


logger = logging.getLogger(__name__)


class BaseClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30.0,
        retry_config: Optional[RetryConfig] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.retry_config = retry_config or RetryConfig()
        self.rate_limiter = rate_limiter

        # Circuit breaker is internal (not configurable via constructor per prompt).
        self.circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=30.0, half_open_max_calls=2)

        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "BaseClient":
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _log(self, *, method: str, url: str, request_json: Any | None, response: httpx.Response | None) -> None:
        # Keep logs structured and safe; avoid huge dumps.
        try:
            logger.debug(
                "http.request",
                extra={"method": method, "url": url, "json": request_json},
            )
        except Exception:
            pass

        if response is not None:
            body_preview = None
            try:
                body_preview = response.text[:1000]
            except Exception:
                body_preview = None
            try:
                logger.debug(
                    "http.response",
                    extra={"method": method, "url": url, "status_code": response.status_code, "body": body_preview},
                )
            except Exception:
                pass

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if self._client is None:
            raise RuntimeError("Client not initialized. Use 'async with'.")

        if not self.circuit_breaker.can_execute():
            raise CircuitBreakerOpen(self.__class__.__name__)

        if self.circuit_breaker.state == CircuitState.HALF_OPEN:
            self.circuit_breaker._on_half_open_attempt()

        if self.rate_limiter is not None:
            await self.rate_limiter.acquire()

        url = path

        @with_retry(self.retry_config)
        async def do() -> dict[str, Any]:
            response: httpx.Response | None = None
            try:
                response = await self._client.request(
                    method,
                    url,
                    headers=self._headers(),
                    json=json_body,
                    params=params,
                )
                self._log(method=method, url=url, request_json=json_body, response=response)
            except httpx.TimeoutException:
                raise TimeoutError("Request timed out", timeout_seconds=self.timeout)

            body: dict[str, Any] | None = None
            try:
                body = response.json() if response.content else None
            except json.JSONDecodeError:
                body = None

            if response.status_code == 429:
                retry_after = RateLimiter.parse_retry_after(response.headers.get("Retry-After"))
                raise RateLimitError(
                    "Rate limit exceeded",
                    retry_after=retry_after,
                    response_body=body,
                )

            if response.status_code >= 400:
                raise APIError(
                    f"HTTP {response.status_code}",
                    status_code=response.status_code,
                    response_body=body,
                )

            return body or {}

        try:
            data = await do()
            self.circuit_breaker.record_success()
            return data
        except (APIError, RateLimitError, TimeoutError) as e:
            # failures that should count towards circuit breaker if they are transient
            if isinstance(e, APIError) and e.status_code in self.retry_config.retryable_status_codes:
                self.circuit_breaker.record_failure()
            elif isinstance(e, TimeoutError):
                self.circuit_breaker.record_failure()
            elif isinstance(e, RateLimitError):
                # 429 shouldn't open the circuit breaker by default
                pass
            else:
                self.circuit_breaker.record_failure()
            raise


class UserServiceClient(BaseClient):
    async def get_user(self, user_id: str) -> User:
        data = await self._request("GET", f"/users/{user_id}")
        try:
            return User.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)

    async def create_user(self, request: CreateUserRequest) -> User:
        data = await self._request("POST", "/users", json_body=request.model_dump(mode="json"))
        try:
            return User.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)

    async def update_user(self, user_id: str, request: UpdateUserRequest) -> User:
        data = await self._request("PUT", f"/users/{user_id}", json_body=request.model_dump(mode="json"))
        try:
            return User.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)

    async def list_users(self, page: int = 1, limit: int = 20) -> List[User]:
        data = await self._request("GET", "/users", params={"page": page, "limit": limit})
        try:
            parsed = ListUsersResponse.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)
        return parsed.users


class PaymentServiceClient(BaseClient):
    async def create_payment(self, request: CreatePaymentRequest) -> Payment:
        data = await self._request("POST", "/payments", json_body=request.model_dump(mode="json"))
        try:
            return Payment.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)

    async def get_payment(self, payment_id: str) -> Payment:
        data = await self._request("GET", f"/payments/{payment_id}")
        try:
            return Payment.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)

    async def refund_payment(self, request: RefundRequest) -> Payment:
        data = await self._request(
            "POST",
            f"/payments/{request.payment_id}/refund",
            json_body={"amount": request.amount, "reason": request.reason},
        )
        try:
            return Payment.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)

    async def get_transaction(self, transaction_id: str) -> Transaction:
        data = await self._request("GET", f"/transactions/{transaction_id}")
        try:
            return Transaction.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)


class NotificationServiceClient(BaseClient):
    async def send_notification(self, request: SendNotificationRequest) -> Notification:
        data = await self._request("POST", "/notifications", json_body=request.model_dump(mode="json"))
        try:
            return Notification.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)

    async def get_notification(self, notification_id: str) -> Notification:
        data = await self._request("GET", f"/notifications/{notification_id}")
        try:
            return Notification.model_validate(data)
        except PydanticValidationError as e:
            raise ValidationError("Invalid response schema", field_errors=e.errors(), response_body=data)

    async def get_notification_status(self, notification_id: str) -> Notification:
        # API surface only defines GET /notifications/{id} for fetching status.
        return await self.get_notification(notification_id)
