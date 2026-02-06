FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY repository_after/ ./repository_after/
COPY tests/ ./tests/

# Set working directory to app root
WORKDIR /app

# Default command (run tests)
CMD ["pytest", "-q", "tests"]
