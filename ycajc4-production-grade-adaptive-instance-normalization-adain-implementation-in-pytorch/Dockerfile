
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies for PyTorch during build
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies with timeout and retry logic
RUN pip install --no-cache-dir --timeout 300 --retries 3 -r requirements.txt || \
    pip install --no-cache-dir --timeout 600 --retries 5 -r requirements.txt

# Copy the rest of the application
COPY . .

# Default command (can be overridden by docker-compose)
CMD ["python", "-m", "pytest", "tests/", "-v"]
