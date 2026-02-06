# Webhook Delivery System - Problem Solving Trajectory

## 1. Problem Statement

Based on the problem statement, I identified the following critical issues in the existing webhook delivery system:

- **Silent failures**: Webhook delivery was failing without proper error tracking
- **Duplicate payloads**: Network timeouts triggered uncontrolled retries causing duplicates
- **Missing signatures**: No way to verify payload authenticity
- **Cascading failures**: When popular endpoints went down, all pending retries fired simultaneously
- **Async issues**: Database sessions were closing before scheduled retries completed
- **Health score corruption**: The scoring algorithm was corrupting its own counters
- **Synchronous patterns blocking event loop**: Async database queries were using synchronous patterns

## 2. Requirements Analysis

Based on the prompt, I identified 12 specific requirements that must be met:

### Core Requirements (1-3): Signature Generation
1. HMAC-SHA256 signature with `{timestamp}.{payload}` format and `t={timestamp},v1={signature}` header
2. Secret keys using `secrets.token_urlsafe(32)` for 256-bit entropy
3. Constant-time comparison using `hmac.compare_digest()` for security

### Retry Logic Requirements (4-5): Backoff and Jitter
4. Exponential backoff formula: `base_delay * (2 ^ (attempt - 1))` = 1s, 2s, 4s, 8s, 16s
5. Bidirectional jitter (±30%) to prevent thundering herd

### Technical Requirements (6-9): Async and Data
6. Background workers must create their own database sessions
7. Async SQLAlchemy 2.0 queries with `select()` and `session.execute()`
8. Composite unique constraint on `(webhook_id, idempotency_key)` for idempotency scoping
9. Payload size validation before full body load (streaming or Content-Length check)

### Logic Requirements (10-12): Health and Retry
10. Health score using EMA with alpha=0.2 to weight recent results
11. Graceful shutdown completing in-flight deliveries
12. Manual retry validation (HTTP 409 for SUCCESS deliveries)

## 3. Constraints Analysis

Based on the constraints section, I identified these critical design boundaries:

- **Timing attacks**: Must use constant-time comparison for signatures
- **Memory limits**: Payloads must be rejected before full body load
- **Resource bounds**: create unbounded queues
 Retry scheduling must not- **Clock tolerance**: Signature validation must support configurable clock skew (default 5 minutes)
- **Async safety**: All database operations must use async/await
- **Idempotency scope**: Must allow same key across different webhooks (composite constraint)
- **Cancellation**: Background tasks must respect shutdown signals

## 4. Research and Resources

### HMAC-SHA256 Signature Implementation
I researched proper HMAC implementation patterns from Python's `hmac` module documentation and webhook signature best practices from industry standards like Stripe's webhook signature verification.

**Key findings:**
- HMAC-SHA256 is the recommended algorithm for webhook signatures
- Timestamp inclusion is critical for replay attack prevention
- Header format `t={timestamp},v1={signature}` is a common industry standard

**Resources:**
- Python `hmac` module: https://docs.python.org/3/library/hmac.html
- Stripe webhook signatures: https://stripe.com/docs/webhooks/signatures

### Async SQLAlchemy 2.0 Patterns
I researched the new async SQLAlchemy 2.0 patterns to ensure proper async database operations.

**Key findings:**
- Async sessions don't have `.query()` method
- Must use `select()` statements with `session.execute()`
- `scalar_one_or_none()` replaces `query().filter().one_or_none()`

**Resources:**
- SQLAlchemy 2.0 async documentation: https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html
- FastAPI async database patterns: https://fastapi.tiangolo.com/async/

### Exponential Backoff and Jitter
I researched retry patterns from distributed systems literature.

**Key findings:**
- Exponential backoff with jitter prevents thundering herd
- Bidirectional jitter (±) is better than only subtraction
- Formula: `delay + random(-0.3*delay, +0.3*delay)`

**Resources:**
- AWS exponential backoff guidelines: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Google SRE retry patterns: https://sre.google/sre-book/handling-dependency-induced-failure/

### Constant-Time Comparison
I researched timing attack prevention for signature verification.

**Key findings:**
- Direct string comparison (==) leaks timing information
- `hmac.compare_digest()` provides constant-time comparison
- This prevents attackers from incrementally discovering valid signatures

**Resources:**
- Python timing attack prevention: https://docs.python.org/3/library/hmac.html#hmac.compare_digest
- OWASP timing attack guidance: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#implement-proper-password-storage-verification

### Exponential Moving Average for Health Scoring
I researched EMA algorithms for health scoring.

**Key findings:**
- Simple ratio doesn't weight recent results properly
- EMA with alpha=0.2 gives each new result 20% weight
- Formula: `score = alpha * outcome + (1 - alpha) * old_score`

**Resources:**
- EMA definition: https://en.wikipedia.org/wiki/Moving_average#Exponential_moving_average
- Technical analysis EMA: https://www.investopedia.com/terms/e/ema.asp

## 5. Method Selection and Rationale

### Signature Method Selection
I chose HMAC-SHA256 with timestamp-based signature because:
- **Security**: HMAC-SHA256 is widely accepted as secure for payload signing
- **Replay prevention**: Timestamp inclusion prevents captured requests from being replayed
- **Future-proofing**: Versioned header format (`v1=`) allows algorithm upgrades

**Why not other approaches:**
- Plain SHA256 without HMAC would expose secret keys
- UUIDs for secrets have predictable structure reducing entropy
- Timestamp-only signatures without HMAC are vulnerable to modification

### Retry Strategy Selection
I chose exponential backoff with bidirectional jitter because:
- **Progressive delays**: 1s, 2s, 4s, 8s, 16s sequence gives endpoints time to recover
- **Jitter spreading**: Bidirectional jitter (±30%) prevents synchronized retries
- **Configurability**: Base delay and max attempts are configurable

**Why this works:**
- Exponential backoff reduces load on failing endpoints
- Jitter randomizes retry times preventing thundering herd
- Default 5 attempts with 1s base gives ~30s total retry window

### Async Database Session Selection
I chose to create new sessions in background workers because:
- **Async session safety**: Async SQLAlchemy sessions are not thread-safe
- **Context isolation**: Each retry must have its own session
- **Memory management**: Sessions are properly closed after use

**Why not other approaches:**
- Inheriting request context sessions would cause "session is closed" errors
- Synchronous session patterns block the async event loop

### Health Score Method Selection
I chose exponential moving average because:
- **Recent weighting**: Alpha=0.2 gives 20% weight to new results
- **Recovery time**: ~15 successful deliveries recover score from 0% to ~95%
- **Simplicity**: Single EMA value tracks both success and failure patterns

**Why not simple ratio:**
- Simple ratio `success_count / total_count` would show 1% health for endpoint that failed 1000 times last month
- EMA allows endpoints to recover faster based on recent performance

### Payload Size Validation Method
I chose streaming body validation with Content-Length check because:
- **Memory safety**: Large payloads are rejected before full body load
- **Header-first**: Content-Length allows fast rejection without body read
- **Chunked support**: Streaming handles requests without Content-Length

**Why this works:**
- Content-Length header provides fast path for most requests
- Streaming fallback handles edge cases (chunked encoding, missing headers)
- 256KB default limit prevents memory exhaustion

## 6. Solution Implementation and Explanation

### Signature Implementation
I implemented signature generation in `signatures.py` with `generate_secret_key()` using `secrets.token_urlsafe(32)` which produces 256 bits of entropy. The signature format combines timestamp and payload as `{timestamp}.{payload}` which prevents replay attacks because timestamps expire.

**Code reference:**
```python
def generate_secret_key() -> str:
    return secrets.token_urlsafe(32)

def generate_signature(secret_key: str, payload: bytes, timestamp: int) -> str:
    signature_input = f"{timestamp}.".encode('utf-8') + payload
    signature = hmac.new(
        secret_key.encode('utf-8'),
        signature_input,
        hashlib.sha256
    ).hexdigest()
    return signature
```

### Constant-Time Comparison
I used `hmac.compare_digest()` in `signatures.py` for signature verification. This prevents timing attacks because the comparison time is constant regardless of how many characters match.

**Code reference:**
```python
return hmac.compare_digest(expected_signature, provided_signature)
```

### Exponential Backoff with Jitter
I implemented retry logic in `retry.py` with:
- Backoff formula: `base_delay * (2 ** (attempt - 1))` = 1s, 2s, 4s, 8s, 16s
- Bidirectional jitter: `delay + random.uniform(-jitter_amount, jitter_amount)`

**Code reference:**
```python
def calculate_exponential_delay(attempt: int, base_delay: float) -> float:
    return base_delay * (2 ** (attempt - 1))

def calculate_jitter(delay: float, jitter_range: float = 0.3) -> float:
    jitter_amount = delay * jitter_range
    return delay + random.uniform(-jitter_amount, jitter_amount)
```

### Async Database Sessions
I created `get_db_session()` in `database.py` which returns a new session for background tasks. This ensures each scheduled retry has its own session.

**Code reference:**
```python
async def get_db_session() -> AsyncSession:
    return async_session_factory()
```

### Composite Idempotency Constraint
I added composite unique constraint in `models.py` on `(webhook_id, idempotency_key)` which allows the same event ID to be used across different webhooks.

**Code reference:**
```python
UniqueConstraint("webhook_id", "idempotency_key", name="uq_webhook_idempotency_key")
```

### Streaming Payload Validation
I implemented middleware in `main.py` that validates payload size before full body load. It first checks Content-Length header, then falls back to streaming validation.

**Code reference:**
```python
class PayloadSizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Check Content-Length first
        content_length = request.headers.get("content-length")
        if content_length:
            size = int(content_length)
            if size > MAX_REQUEST_SIZE:
                return JSONResponse(status_code=413, ...)
        
        # Stream and validate for chunked/missing Content-Length
        body = b""
        async for chunk in request.stream():
            body += chunk
            if len(body) > MAX_REQUEST_SIZE:
                return JSONResponse(status_code=413, ...)
```

### EMA Health Scoring
I implemented health scoring in `delivery.py` using proper EMA formula:

**Code reference:**
```python
alpha = 0.2
outcome = 1.0 if success else 0.0
health.health_score = alpha * outcome + (1 - alpha) * health.health_score
```

### Graceful Shutdown
I implemented shutdown handling in `worker.py` that:
1. Waits for in-flight deliveries to complete
2. Persists all RETRYING status records with valid `next_retry_at` timestamps
3. Then shuts down the scheduler

**Code reference:**
```python
async def stop_scheduler(graceful: bool = True):
    if graceful:
        # Wait for in-flight deliveries
        await asyncio.sleep(2)
        
        # Persist pending retry records
        session = await get_db_session()
        result = await session.execute(
            select(DeliveryAttempt)
            .where(DeliveryAttempt.status == DeliveryStatus.RETRYING)
        )
        retrying = result.scalars().all()
        for attempt in retrying:
            if attempt.next_retry_at is None:
                attempt.next_retry_at = get_next_retry_time(...)
        await session.commit()
    
    scheduler.shutdown(wait=graceful)
```

### Manual Retry Validation
I added status validation in `webhooks.py` returning HTTP 409 for SUCCESS deliveries:

**Code reference:**
```python
if delivery.status == DeliveryStatus.SUCCESS:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Cannot retry successful delivery"
    )
```

## 7. How Solutions Handle Requirements and Constraints

### Requirements Matrix

| Requirement | Solution File | How It's Addressed |
|-------------|---------------|-------------------|
| 1 (Signature format) | `signatures.py` | `{timestamp}.{payload}` format with `t={timestamp},v1={signature}` header |
| 2 (Secret key entropy) | `signatures.py` | `secrets.token_urlsafe(32)` produces 256-bit entropy |
| 3 (Constant-time compare) | `signatures.py` | `hmac.compare_digest()` prevents timing attacks |
| 4 (Backoff sequence) | `retry.py` | `base_delay * (2 ** (attempt - 1))` = 1s, 2s, 4s, 8s, 16s |
| 5 (Bidirectional jitter) | `retry.py` | `delay + random.uniform(-jitter_amount, jitter_amount)` |
| 6 (Own DB sessions) | `worker.py`, `database.py` | Background workers call `get_db_session()` for new sessions |
| 7 (Async SQLAlchemy 2.0) | `worker.py`, `delivery.py` | Uses `select()` with `session.execute()` and `scalars().all()` |
| 8 (Composite idempotency) | `models.py` | Unique constraint on `(webhook_id, idempotency_key)` |
| 9 (Payload validation) | `main.py` | Streaming validation with Content-Length check |
| 10 (EMA health) | `delivery.py` | `alpha * outcome + (1-alpha) * old_score` formula |
| 11 (Graceful shutdown) | `worker.py` | Waits for in-flight, persists retries, then exits |
| 12 (Retry validation) | `webhooks.py` | HTTP 409 for SUCCESS with "Cannot retry successful delivery" |

### Constraints Handling

| Constraint | Solution File | How It's Addressed |
|------------|---------------|-------------------|
| Timing attack prevention | `signatures.py` | `hmac.compare_digest()` ensures constant comparison time |
| Memory safety | `main.py` | Streaming validation rejects before full body load |
| Unbounded queue prevention | `worker.py` | `.limit(100)` on batch processing |
| Clock skew tolerance | `signatures.py` | Configurable `clock_skew_tolerance` default 300s (5 min) |
| Async operations | `worker.py`, `database.py` | `async with` context managers for proper resource cleanup |
| Shutdown signals | `worker.py` | Signal handlers for SIGINT/SIGTERM |
| Idempotency scoping | `models.py` | Composite constraint allows same key across webhooks |

### Edge Cases Handled

1. **Chunked encoding requests**: Middleware streams body to validate size
2. **Missing Content-Length**: Streaming fallback validates without header
3. **Session closure**: Background workers create their own sessions
4. **Retry storms**: Bidirectional jitter spreads retry times
5. **Health score recovery**: EMA allows recovery after failures
6. **Duplicate retries**: Manual retry generates new idempotency key
7. **Successful retry**: Manual retry returns 409 for already-successful deliveries
8. **Graceful shutdown**: Waits for in-flight requests before exit
