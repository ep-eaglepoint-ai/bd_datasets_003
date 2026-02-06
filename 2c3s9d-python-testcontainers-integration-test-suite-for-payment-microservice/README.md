# Python Testcontainers Integration Test Suite for Payment Microservice

A comprehensive integration test suite for a payment processing microservice using Testcontainers.

## Docker Commands

### 1. Run Tests on repository_before

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_before app pytest -q
```

Commands to spin up the app and run tests on repository_before (tests are skipped, always passes with exit code 0)

### 2. Run Tests on repository_after

```bash
docker compose run --rm -e PYTHONPATH=/app/repository_after app pytest -q
```

Commands to run tests on repository_after (tests run and pass)

### 3. Run Evaluation

```bash
docker compose run --rm app python evaluation/evaluation.py
```

Commands to run evaluation/evaluation.py and generate reports

## Docker Rate Limiting Solutions

If you encounter Docker Hub rate limiting errors:

```
"toomanyrequests: You have reached your unauthenticated pull rate limit"
```

### Solution 1: Use Docker Registry Mirror

Set the `DOCKER_REGISTRY_MIRROR` environment variable to use a mirror:

```bash
# Use Google Container Registry mirror
docker compose run --rm -e PYTHONPATH=/app/repository_after -e DOCKER_REGISTRY_MIRROR=mirror.gcr.io app pytest -q

# Use USTC mirror (China)
docker compose run --rm -e PYTHONPATH=/app/repository_after -e DOCKER_REGISTRY_MIRROR=docker.mirrors.ustc.edu.cn app pytest -q
```

### Solution 2: Configure Docker Daemon

Add registry mirrors to your Docker daemon configuration (`/etc/docker/daemon.json`):

```json
{
  "registry-mirrors": [
    "https://mirror.gcr.io",
    "https://docker.mirrors.ustc.edu.cn"
  ]
}
```

Then restart Docker:

```bash
sudo systemctl restart docker
```

### Solution 3: Authenticate with Docker Hub

Login to Docker Hub to increase rate limits:

```bash
docker login
```

### Solution 4: Pre-pull Images

Pull images before running tests:

```bash
docker pull postgres:15-alpine
docker pull redis:7-alpine
docker pull rabbitmq:3-management-alpine
```

## Testcontainers Configuration

The test suite uses:

- **PostgreSQL**: `postgres:15-alpine` on port 5432
- **Redis**: `redis:7-alpine` on port 6379
- **RabbitMQ**: `rabbitmq:3-management-alpine` on port 5672

All containers are session-scoped and cleaned up after tests complete.
