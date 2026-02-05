# Testcontainers Integration Test Suite for Payment Microservice
# Python 3.11+ with pytest-asyncio and Testcontainers

FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for PostgreSQL, Redis, and RabbitMQ clients
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY repository_after/ ./repository_after/

# Copy test code
COPY tests/ ./tests/

# Set Python path
ENV PYTHONPATH=/app/repository_after

# Default command runs tests
CMD ["pytest", "-q", "--tb=short", "tests"]
