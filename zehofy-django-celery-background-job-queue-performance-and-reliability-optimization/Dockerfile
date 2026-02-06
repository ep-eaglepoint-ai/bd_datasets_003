# Dockerfile for running tests on the optimized implementation
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy repository_after (optimized implementation)
COPY repository_after/ ./repository_after/

# Copy tests
COPY tests/ ./tests/

# Set Django settings
ENV DJANGO_SETTINGS_MODULE=config.settings
ENV PYTHONPATH=/app/repository_after

# Run tests
CMD ["python", "-m", "pytest", "tests/", "-v", "--tb=short"]
