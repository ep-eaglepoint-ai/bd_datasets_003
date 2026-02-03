FROM python:3.11-slim
WORKDIR /app

# Install pytest for running tests
RUN pip install --no-cache-dir pytest

# Copy project files
COPY repository_after/ /app/repository_after/
COPY tests/ /app/tests/
COPY evaluation/ /app/evaluation/

# Set working directory to repository_after for imports
ENV PYTHONPATH=/app/repository_after

# Default command
CMD ["pytest", "-q", "tests"]
