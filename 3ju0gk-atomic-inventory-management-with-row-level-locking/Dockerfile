# Dockerfile  (at repository root – only one file)

FROM python:3.11-slim

# Common environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=off

# Install system dependencies needed for both Python (psycopg2) and Node (basic build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    gnupg \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend requirements and install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy frontend package files and install Node deps
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --legacy-peer-deps

# Copy the rest of the project
COPY . .

# Expose both ports (Django + Vite / React dev server)
EXPOSE 8000 5173

# Default command = backend (most common default)
CMD ["python", "repository_after/manage.py", "runserver", "0.0.0.0:8000"]