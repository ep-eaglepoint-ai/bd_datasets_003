FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY repository_after/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install pytest for testing
RUN pip install --no-cache-dir pytest

# Copy all project files
COPY . /app/

# Set Python path
ENV PYTHONPATH=/app

CMD ["python", "-m", "pytest", "tests", "-v"]
