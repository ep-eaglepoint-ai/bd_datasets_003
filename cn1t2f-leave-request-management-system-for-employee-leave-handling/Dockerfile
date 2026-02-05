FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (needed for some python packages or tools if any)
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire project
COPY . .

# Default command (can be overridden in docker-compose)
CMD ["python3", "repository_after/app.py"]
