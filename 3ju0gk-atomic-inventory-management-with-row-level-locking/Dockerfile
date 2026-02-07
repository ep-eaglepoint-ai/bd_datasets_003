FROM python:3.11-slim

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

COPY repository_after/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


WORKDIR /app
COPY repository_after/ .

RUN tr -d '\r' < /app/entrypoint.sh > /entrypoint.sh && \
    chmod +x /entrypoint.sh

EXPOSE 8000 5173

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]