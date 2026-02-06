# Dockerfile
FROM python:3.11-slim

# Install system dependencies + Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=development

WORKDIR /app

# Backend dependencies
COPY repository_after/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend dependencies
COPY repository_after/frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm install

# Copy the rest of the code
WORKDIR /app
COPY repository_after/ .

EXPOSE 8000 5173

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]