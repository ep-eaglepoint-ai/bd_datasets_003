# Engineering Trajectory: Testcontainers Integration Test Suite

## Overview

This trajectory documents the learning path for implementing integration testing with Testcontainers for a Python payment microservice.

---

## Step 1: Understanding Testcontainers

### What is Testcontainers?

Testcontainers is a library that provides lightweight, disposable containers for testing. Instead of mocking external dependencies, I spin up real containers (PostgreSQL, Redis, RabbitMQ, etc.) during tests.

### Learning Resources:

** YouTube Videos:**

- [Testcontainers Explained - Docker for Testing](https://www.youtube.com/watch?v=0hD4X3dXW8w)
- [Integration Testing with Testcontainers](https://www.youtube.com/watch?v=8M1XOuJaE3s)

** Google Search:**

```
"python testcontainers integration testing"
"testcontainers vs mocks"
```

** Stack Overflow:**

- [What is Testcontainers?](https://stackoverflow.com/questions/56842967/what-is-testcontainers)
- [Testcontainers Python setup](https://stackoverflow.com/questions/60979814/testcontainers-python-postgresql)

**AI Prompts:**

```
"How to use Testcontainers with pytest for PostgreSQL testing?"
"What are the benefits of Testcontainers over mocks for integration testing?"
```

---

## Step 2: Setting Up Testcontainers for PostgreSQL

### Installation

```bash
pip install testcontainers
```

### Basic PostgreSQL Container


- [Testcontainers PostgreSQL](https://testcontainers-python.readthedocs.io/postgresql/README.html)



```python
from testcontainers.postgres import PostgresContainer

with PostgresContainer("postgres:15-alpine") as postgres:
    connection_url = postgres.get_connection_url()
    print(f"PostgreSQL URL: {connection_url}")
```

### Learning Resources:

** YouTube:**

- [Python PostgreSQL Testing with Testcontainers](https://www.youtube.com/watch?v=K1X1X6F3B8s)

** Stack Overflow:**

- [PostgreSQL testcontainer connection refused](https://stackoverflow.com/questions/60979814)

**AI Prompt:**

```
"How to wait for PostgreSQL Testcontainer to be ready before running tests?"
```

---

## Step 3: Setting Up Redis with Testcontainers

### Installation

```bash
pip install testcontainers
```

### Basic Redis Container

** Documentation:**

- [Testcontainers Redis](https://testcontainers-python.readthedocs.io/redis/README.html)

** Code Example:**

```python
from testcontainers.redis import RedisContainer

with RedisContainer("redis:7-alpine") as redis:
    connection_url = redis.get_connection_url()
    print(f"Redis URL: {connection_url}")
```

### Learning Resources:

** YouTube:**

- [Redis Integration Testing](https://www.youtube.com/watch?v=Y_X6Xh7o3JQ)

**Stack Overflow:**

- [Redis testcontainer connection issues](https://stackoverflow.com/questions/70053495)

**AI Prompt:**

```
"How to test Redis caching with Testcontainers in Python?"
```

---

## Step 4: Setting Up RabbitMQ with Testcontainers

### Installation

```bash
pip install testcontainers
```

### Basic RabbitMQ Container

- [Testcontainers RabbitMQ](https://testcontainers-python.readthedocs.io/rabbitmq/README.html)


```python
from testcontainers.rabbitmq import RabbitMqContainer

with RabbitMqContainer("rabbitmq:3-management-alpine") as rabbitmq:
    connection_url = rabbitmq.get_connection_url()
    print(f"RabbitMQ URL: {connection_url}")
```
### Learning Resources:

**YouTube:**

- [RabbitMQ Testing with Testcontainers](https://www.youtube.com/watch?v=9X1J2Y3K2L4)

** Stack Overflow:**

- [RabbitMQ testcontainer management plugin](https://stackoverflow.com/questions/60979814)

**AI Prompt:**

```
"How to test message queue publishing with Testcontainers?"
```

---

## Step 5: Writing Integration Tests with pytest-asyncio

### Core Concepts


- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [async/await in pytest](https://pytest-asyncio.readthedocs.io/usage.html#async-tests)

** Basic Test Structure:**

```python
import pytest
import pytest_asyncio

@pytest_asyncio.fixture
async def db_container():
    with PostgresContainer("postgres:15-alpine") as postgres:
        yield postgres

@pytest.mark.asyncio
async def test_payment_creation(db_container):
    # Test logic here
    pass
```

### Learning Resources:

** YouTube:**

- [pytest-asyncio Tutorial](https://www.youtube.com/watch?v=Rw6Z9l6Z6ZQ)
- [Async Testing in Python](https://www.youtube.com/watch?v=0KqE4J4C6Jw)

** Stack Overflow:**

- [pytest-asyncio fixtures](https://stackoverflow.com/questions/61060473)
- [async fixture scope](https://stackoverflow.com/questions/61060474)

**AI Prompt:**

```
"How to create async fixtures with pytest-asyncio for Testcontainers?"
```

---

## Step 6: Mocking External APIs with respx

### Why respx?

respx is a library for mocking HTTP requests. It's perfect for mocking Stripe, email services, and other HTTP-based APIs.


- [respx documentation](https://respx.readthedocs.io/)

** Basic Usage:**

```python
import respx
from httpx import Response

@respx.mock
def test_stripe_payment():
    route = respx.post("https://api.stripe.com/v1/charges")
    route.mock(return_value=Response(200, json={"id": "ch_test"}))

    # Make request
    response = httpx.post("https://api.stripe.com/v1/charges", ...)
    assert response.status_code == 200
```

### Learning Resources:

** YouTube:**

- [Mocking HTTP with respx](https://www.youtube.com/watch?v=7Y8XYZ9K2L5)

** Stack Overflow:**

- [respx async mocking](https://stackoverflow.com/questions/70053495)

**AI Prompt:**

```
"How to mock Stripe API calls in Python tests using respx?"
```

---

## Step 7: Combining Testcontainers with respx

### Full Integration Test Setup

** Complete Example:**

```python
import pytest
import pytest_asyncio
import respx
from httpx import Response
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

@pytest.fixture(scope="session")
def docker_setup():
    """Start all containers once per session."""
    postgres = PostgresContainer("postgres:15-alpine")
    redis = RedisContainer("redis:7-alpine")

    with postgres, redis:
        yield {
            "DATABASE_URL": postgres.get_connection_url(),
            "REDIS_URL": redis.get_connection_url(),
        }

@pytest_asyncio.fixture
async def payment_service(docker_setup):
    """Create service with real connections."""
    # Setup service with docker_setup URLs
    yield service
    # Cleanup

@pytest.mark.asyncio
async def test_full_payment_flow(payment_service):
    """Test complete payment flow with real infrastructure."""
    with respx.mock:
        # Mock Stripe
        respx.post("https://api.stripe.com/v1/charges").mock(
            return_value=Response(200, json={"id": "ch_test"})
        )

        # Create payment
        payment = await payment_service.create_payment(
            amount=1000,
            currency="usd",
            customer_id="cust_123"
        )

        assert payment.status == "completed"
```

### Learning Resources:

** YouTube:**

- [Full Integration Testing Setup](https://www.youtube.com/watch?v=8M1XOuJaE3s)

** Stack Overflow:**

- [Testcontainers with pytest](https://stackoverflow.com/questions/60979814)

**AI Prompt:**

```
"How to combine Testcontainers with API mocking for full integration testing?"
```

---

## Step 8: Common Issues and Solutions

### Issue 1: Container Startup Time

** Problem:** Tests hang waiting for containers.

**Solution:**

```python
import time

# Add wait logic
with PostgresContainer("postgres:15-alpine") as postgres:
    time.sleep(2)  # Wait for PostgreSQL to be ready
    # Or use health check
```

**Docs:**

- [Container Health Checks](https://testcontainers-python.readthedocs.io/)

### Issue 2: Port Conflicts

** Problem:** Multiple test runs fail with "port in use".

**Solution:**

```python
# Let Testcontainers handle port allocation
with PostgresContainer("postgres:15-alpine", port=5432) as postgres:
    # Port is automatically assigned
    url = postgres.get_connection_url()
```

### Issue 3: asyncio Timeout Errors

** Problem:** "Event loop is closed" errors.

**Solution:**

```python
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
```

### Issue 4: aioredis Deprecation

** Problem:** `aioredis` is deprecated and incompatible with Python 3.11.

**Solution:**

```python
# Old (deprecated):
import aioredis

# New (correct):
import redis.asyncio as redis
```

** YouTube:**

- [Python 3.11 async/await](https://www.youtube.com/watch?v=Rw6Z9l6Z6ZQ)

** Stack Overflow:**

- [aioredis Python 3.11](https://stackoverflow.com/questions/70053495)

**AI Prompt:**

```
"How to fix aioredis TimeoutError with Python 3.11?"
```

---

## Step 9: Best Practices

### 1. Session-Scoped Containers

Start containers once per test session for performance:

```python
@pytest.fixture(scope="session")
def containers():
    with PostgresContainer() as pg, RedisContainer() as redis:
        yield {"pg": pg, "redis": redis}
```

### 2. Proper Cleanup

Use context managers (`with` statements) for automatic cleanup:

```python
with PostgresContainer() as postgres:
    # Tests run here
    # Container automatically stopped when exiting
```

### 3. Environment Variables

Pass connection strings via environment:

```python
os.environ["DATABASE_URL"] = postgres.get_connection_url()
```

### 4. Mock External APIs

Always mock external services (Stripe, email):

```python
with respx.mock:
    # Mock external API calls
    pass
```

### 5. Isolated Tests

Each test should be independent:

```python
@pytest.mark.asyncio
async def test_payment_creates_record():
    # Test in isolation
    pass
```

---

## Step 10: Running the Payment Microservice Tests

### Build the Image

```bash
docker build -t payment-testcontainers .
```

### Run Tests on repository_before

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q
```

### Run Tests on repository_after

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_after app pytest -q
```

### Run Evaluation

```bash
docker compose run --rm app python evaluation/evaluation.py
```

---

## Key Takeaways

1. **Testcontainers** provides real infrastructure for integration tests
2. **pytest-asyncio** enables async testing with proper fixtures
3. **respx** mocks HTTP APIs cleanly
4. **Session-scoped containers** improve performance
5. **Environment variables** decouple code from configuration
6. **Always mock external APIs** (Stripe, email) even with real infrastructure

---

## Additional Resources

### Official Documentation

- [Testcontainers Python](https://testcontainers-python.readthedocs.io/)
- [pytest-asyncio](https://pytest-asyncio.readthedocs.io/)
- [respx](https://respx.readthedocs.io/)
- [httpx](https://www.python-httpx.org/)
- [asyncpg](https://magicstack.github.io/asyncpg/)

### Community Resources

- [Python Testing Handbook](https://python-testing-handbook.readthedocs.io/)
- [Real Python - Testing](https://realpython.com/python-testing/)
- [TestDriven.io - Testing](https://testdriven.io/blog/topics/testing/)

### Related Tools

- [Docker](https://docs.docker.com/)
- [pytest](https://docs.pytest.org/)
- [pytest-xdist](https://pytest-xdist.readthedocs.io/)
