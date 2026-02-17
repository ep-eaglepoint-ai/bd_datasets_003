# Minimal Docker image for spectral normalization tests
FROM python:3.11-slim

WORKDIR /app

# Copy and install dependencies (CPU-only PyTorch ~150MB)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# PYTHONPATH for test imports
ENV PYTHONPATH="/app/repository_after"

CMD ["pytest", "-v", "--tb=short"]
