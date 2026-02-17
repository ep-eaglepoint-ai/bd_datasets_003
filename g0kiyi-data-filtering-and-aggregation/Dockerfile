FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . /app

# Default command (can be overridden by docker-compose)
CMD ["python3", "-m", "unittest", "discover", "-s", "tests"]
