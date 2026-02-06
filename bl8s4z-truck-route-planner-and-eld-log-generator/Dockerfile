# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY repository_after/frontend/package*.json ./
RUN npm install

COPY repository_after/frontend/ ./
RUN npm run build

# Stage 2: Python backend
FROM python:3.11-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    && rm -rf /var/lib/apt/lists/*

COPY repository_after/backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY repository_after/backend/ ./

COPY --from=frontend-build /app/frontend/dist /app/static/frontend

RUN python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8000

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "truck_planner.wsgi:application"]

# Stage 3: Test stage
FROM node:20-alpine AS test

WORKDIR /app

# Install Python and pip for backend tests
RUN apk add --no-cache python3 py3-pip
ENV PYTHONPATH=/app/repository_after/backend

WORKDIR /app/tests

COPY tests/package*.json ./
RUN npm install

COPY tests/ ./
WORKDIR /app
COPY repository_after/ /app/repository_after/

# Install backend dependencies
COPY repository_after/backend/requirements.txt /app/repository_after/backend/
RUN pip install --no-cache-dir -r /app/repository_after/backend/requirements.txt --break-system-packages

WORKDIR /app/repository_after/frontend
RUN npm install

WORKDIR /app

# Create a script to run both tests
RUN echo '#!/bin/sh' > /app/run_tests.sh && \
    echo 'echo "Running Frontend Tests..."' >> /app/run_tests.sh && \
    echo 'cd /app/tests && npm test || exit 1' >> /app/run_tests.sh && \
    echo 'echo "Running Backend Tests..."' >> /app/run_tests.sh && \
    echo 'cd /app/repository_after/backend && python3 manage.py test api || exit 1' >> /app/run_tests.sh && \
    chmod +x /app/run_tests.sh

CMD ["/app/run_tests.sh"]
