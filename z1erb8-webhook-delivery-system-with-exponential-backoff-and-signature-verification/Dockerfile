FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
RUN pip install pytest httpx pytest-asyncio

# Copy the entire project context
COPY . /app

# Set PYTHONPATH to include repository_after so "import app..." works
ENV PYTHONPATH=/app/repository_after:/app

# Default command
CMD ["pytest", "tests"]
