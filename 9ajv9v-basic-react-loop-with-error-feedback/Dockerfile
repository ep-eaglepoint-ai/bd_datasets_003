FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt
COPY repository_after/ /app/repository_after/
COPY repository_before/ /app/repository_before/
COPY tests/ /app/tests/
COPY evaluation/ /app/evaluation/
CMD ["python", "-m", "pytest", "-q", "tests"]
