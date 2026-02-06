# --- Backend Stage ---
FROM python:3.11-slim as backend

WORKDIR /app

RUN apt-get update && apt-get install -y libpq-dev gcc curl && rm -rf /var/lib/apt/lists/*

COPY repository_after/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY repository_after/backend/app ./app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# --- Frontend Stage ---
FROM node:18-alpine as frontend

WORKDIR /app

COPY repository_after/frontend/package.json .
RUN npm install

COPY repository_after/frontend .

CMD ["npm", "run", "dev", "--", "--host"]

# --- Harness Stage ---
FROM python:3.11-slim as harness

# Install system dependencies
RUN apt-get update && apt-get install -y docker.io gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for tests and evaluation script
RUN pip install --no-cache-dir pytest pytest-asyncio httpx requests websockets

WORKDIR /app

# Copy the entire workspace
COPY . /app

# The command will be overridden by docker run arguments
CMD ["python", "evaluation/evaluation.py"]
