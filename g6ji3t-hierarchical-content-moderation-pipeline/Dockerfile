FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY . /app

# Install Python deps (no requirements.txt needed)
RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn[standard]==0.30.6 \
    pydantic==2.8.2 \
    httpx==0.27.2 \
    pytest==8.3.3 \
    pytest-asyncio==0.24.0 \
    asgi-lifespan==2.1.0


ENV PYTHONPATH=/app/repository_after

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
