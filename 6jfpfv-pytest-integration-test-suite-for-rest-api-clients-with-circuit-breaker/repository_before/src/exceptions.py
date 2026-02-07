class APIError(Exception):
    def __init__(self, message: str, status_code: int = 500, response_body: dict = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.response_body = response_body or {}


class AuthenticationError(APIError):
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status_code=401)


class AuthorizationError(APIError):
    def __init__(self, message: str = "Access denied"):
        super().__init__(message, status_code=403)


class NotFoundError(APIError):
    def __init__(self, resource: str, resource_id: str):
        super().__init__(f"{resource} with id '{resource_id}' not found", status_code=404)
        self.resource = resource
        self.resource_id = resource_id


class ValidationError(APIError):
    def __init__(self, errors: dict):
        super().__init__("Validation failed", status_code=422)
        self.errors = errors


class RateLimitError(APIError):
    def __init__(self, retry_after: int = 60):
        super().__init__("Rate limit exceeded", status_code=429)
        self.retry_after = retry_after


class ServiceUnavailableError(APIError):
    def __init__(self, message: str = "Service temporarily unavailable"):
        super().__init__(message, status_code=503)


class CircuitOpenError(Exception):
    def __init__(self, service_name: str):
        super().__init__(f"Circuit breaker is open for {service_name}")
        self.service_name = service_name
