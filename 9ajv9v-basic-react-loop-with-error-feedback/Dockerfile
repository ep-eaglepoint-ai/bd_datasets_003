FROM python:3.11-slim
WORKDIR /app

# Copy and install requirements first (for better caching)
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    python -m pytest --version

# Copy application code
COPY repository_after/ /app/repository_after/
COPY repository_before/ /app/repository_before/
COPY tests/ /app/tests/
COPY evaluation/ /app/evaluation/

CMD ["python", "-m", "pytest", "-q", "tests"]
