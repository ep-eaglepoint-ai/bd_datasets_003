FROM python:3.11-slim


RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app


COPY repository_after/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


COPY repository_after/ .


RUN tr -d '\r' < /app/entrypoint.sh > /entrypoint.sh && \
    chmod +x /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]