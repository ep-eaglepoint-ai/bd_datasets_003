import httpx
from typing import Optional, List, Dict, Any
from datetime import datetime
from src.models import User, Payment, Notification, PaymentStatus, NotificationChannel, PaginatedResponse
from src.exceptions import (
    APIError, AuthenticationError, AuthorizationError, NotFoundError,
    ValidationError, RateLimitError, ServiceUnavailableError
)
from src.circuit_breaker import CircuitBreaker
from src.retry import RetryPolicy


class BaseClient:
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
        circuit_breaker: Optional[CircuitBreaker] = None,
        retry_policy: Optional[RetryPolicy] = None
    ):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.circuit_breaker = circuit_breaker
        self.retry_policy = retry_policy
        self._client = httpx.AsyncClient(timeout=timeout)

    def _get_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _handle_response(self, response: httpx.Response) -> Dict[str, Any]:
        if response.status_code == 401:
            raise AuthenticationError()
        if response.status_code == 403:
            raise AuthorizationError()
        if response.status_code == 404:
            data = response.json()
            raise NotFoundError(data.get("resource", "Resource"), data.get("id", "unknown"))
        if response.status_code == 422:
            raise ValidationError(response.json().get("errors", {}))
        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 60))
            raise RateLimitError(retry_after)
        if response.status_code == 503:
            raise ServiceUnavailableError()
        if response.status_code >= 400:
            raise APIError(response.text, response.status_code, response.json() if response.text else {})
        return response.json()

    async def close(self) -> None:
        await self._client.aclose()


class UserServiceClient(BaseClient):
    async def get_user(self, user_id: str) -> User:
        response = await self._client.get(
            f"{self.base_url}/users/{user_id}",
            headers=self._get_headers()
        )
        data = self._handle_response(response)
        return User(
            id=data["id"],
            email=data["email"],
            name=data["name"],
            created_at=datetime.fromisoformat(data["created_at"]),
            is_active=data.get("is_active", True),
            metadata=data.get("metadata")
        )

    async def create_user(self, email: str, name: str, metadata: Optional[dict] = None) -> User:
        response = await self._client.post(
            f"{self.base_url}/users",
            headers=self._get_headers(),
            json={"email": email, "name": name, "metadata": metadata}
        )
        data = self._handle_response(response)
        return User(
            id=data["id"],
            email=data["email"],
            name=data["name"],
            created_at=datetime.fromisoformat(data["created_at"]),
            is_active=data.get("is_active", True),
            metadata=data.get("metadata")
        )

    async def list_users(self, page: int = 1, per_page: int = 20) -> PaginatedResponse:
        response = await self._client.get(
            f"{self.base_url}/users",
            headers=self._get_headers(),
            params={"page": page, "per_page": per_page}
        )
        data = self._handle_response(response)
        users = [
            User(
                id=u["id"],
                email=u["email"],
                name=u["name"],
                created_at=datetime.fromisoformat(u["created_at"]),
                is_active=u.get("is_active", True),
                metadata=u.get("metadata")
            )
            for u in data["items"]
        ]
        return PaginatedResponse(
            items=users,
            total=data["total"],
            page=data["page"],
            per_page=data["per_page"],
            has_next=data["has_next"]
        )

    async def update_user(self, user_id: str, name: Optional[str] = None, metadata: Optional[dict] = None) -> User:
        payload = {}
        if name is not None:
            payload["name"] = name
        if metadata is not None:
            payload["metadata"] = metadata
        response = await self._client.patch(
            f"{self.base_url}/users/{user_id}",
            headers=self._get_headers(),
            json=payload
        )
        data = self._handle_response(response)
        return User(
            id=data["id"],
            email=data["email"],
            name=data["name"],
            created_at=datetime.fromisoformat(data["created_at"]),
            is_active=data.get("is_active", True),
            metadata=data.get("metadata")
        )

    async def delete_user(self, user_id: str) -> bool:
        response = await self._client.delete(
            f"{self.base_url}/users/{user_id}",
            headers=self._get_headers()
        )
        if response.status_code == 204:
            return True
        self._handle_response(response)
        return False


class PaymentServiceClient(BaseClient):
    async def create_payment(self, user_id: str, amount: float, currency: str) -> Payment:
        response = await self._client.post(
            f"{self.base_url}/payments",
            headers=self._get_headers(),
            json={"user_id": user_id, "amount": amount, "currency": currency}
        )
        data = self._handle_response(response)
        return Payment(
            id=data["id"],
            user_id=data["user_id"],
            amount=data["amount"],
            currency=data["currency"],
            status=PaymentStatus(data["status"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            transaction_id=data.get("transaction_id"),
            error_message=data.get("error_message")
        )

    async def get_payment(self, payment_id: str) -> Payment:
        response = await self._client.get(
            f"{self.base_url}/payments/{payment_id}",
            headers=self._get_headers()
        )
        data = self._handle_response(response)
        return Payment(
            id=data["id"],
            user_id=data["user_id"],
            amount=data["amount"],
            currency=data["currency"],
            status=PaymentStatus(data["status"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            transaction_id=data.get("transaction_id"),
            error_message=data.get("error_message")
        )

    async def refund_payment(self, payment_id: str, amount: Optional[float] = None) -> Payment:
        payload = {}
        if amount is not None:
            payload["amount"] = amount
        response = await self._client.post(
            f"{self.base_url}/payments/{payment_id}/refund",
            headers=self._get_headers(),
            json=payload
        )
        data = self._handle_response(response)
        return Payment(
            id=data["id"],
            user_id=data["user_id"],
            amount=data["amount"],
            currency=data["currency"],
            status=PaymentStatus(data["status"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            transaction_id=data.get("transaction_id"),
            error_message=data.get("error_message")
        )

    async def list_payments(self, user_id: Optional[str] = None, status: Optional[PaymentStatus] = None) -> List[Payment]:
        params = {}
        if user_id:
            params["user_id"] = user_id
        if status:
            params["status"] = status.value
        response = await self._client.get(
            f"{self.base_url}/payments",
            headers=self._get_headers(),
            params=params
        )
        data = self._handle_response(response)
        return [
            Payment(
                id=p["id"],
                user_id=p["user_id"],
                amount=p["amount"],
                currency=p["currency"],
                status=PaymentStatus(p["status"]),
                created_at=datetime.fromisoformat(p["created_at"]),
                transaction_id=p.get("transaction_id"),
                error_message=p.get("error_message")
            )
            for p in data
        ]


class NotificationServiceClient(BaseClient):
    async def send_notification(
        self,
        user_id: str,
        channel: NotificationChannel,
        subject: str,
        body: str
    ) -> Notification:
        response = await self._client.post(
            f"{self.base_url}/notifications",
            headers=self._get_headers(),
            json={
                "user_id": user_id,
                "channel": channel.value,
                "subject": subject,
                "body": body
            }
        )
        data = self._handle_response(response)
        return Notification(
            id=data["id"],
            user_id=data["user_id"],
            channel=NotificationChannel(data["channel"]),
            subject=data["subject"],
            body=data["body"],
            sent_at=datetime.fromisoformat(data["sent_at"]) if data.get("sent_at") else None,
            delivered=data.get("delivered", False)
        )

    async def get_notification(self, notification_id: str) -> Notification:
        response = await self._client.get(
            f"{self.base_url}/notifications/{notification_id}",
            headers=self._get_headers()
        )
        data = self._handle_response(response)
        return Notification(
            id=data["id"],
            user_id=data["user_id"],
            channel=NotificationChannel(data["channel"]),
            subject=data["subject"],
            body=data["body"],
            sent_at=datetime.fromisoformat(data["sent_at"]) if data.get("sent_at") else None,
            delivered=data.get("delivered", False)
        )

    async def list_notifications(self, user_id: str, channel: Optional[NotificationChannel] = None) -> List[Notification]:
        params = {"user_id": user_id}
        if channel:
            params["channel"] = channel.value
        response = await self._client.get(
            f"{self.base_url}/notifications",
            headers=self._get_headers(),
            params=params
        )
        data = self._handle_response(response)
        return [
            Notification(
                id=n["id"],
                user_id=n["user_id"],
                channel=NotificationChannel(n["channel"]),
                subject=n["subject"],
                body=n["body"],
                sent_at=datetime.fromisoformat(n["sent_at"]) if n.get("sent_at") else None,
                delivered=n.get("delivered", False)
            )
            for n in data
        ]
