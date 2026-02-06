FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (for caching)
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Verify critical dependencies are installed
RUN python -c "import watchdog; import pytest; print('Dependencies OK')"

# Copy application code
COPY . /app

# Set Python path to include repository_after
ENV PYTHONPATH=/app/repository_after:/app

# Default command runs evaluation
CMD ["python", "evaluation/evaluation.py"]