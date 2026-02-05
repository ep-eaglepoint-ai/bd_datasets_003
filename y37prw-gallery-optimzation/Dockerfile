FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Default command – will be overridden in compose
CMD ["echo", "Please use docker-compose to select before/after"]