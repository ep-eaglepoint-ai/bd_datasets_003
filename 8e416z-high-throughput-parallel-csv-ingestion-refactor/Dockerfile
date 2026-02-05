FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if any (e.g., for psutil/pandas if needed, though slim usually has enough for these)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set PYTHONPATH to include repository directories
ENV PYTHONPATH="/app/repository_after:/app/repository_before:${PYTHONPATH}"

CMD ["pytest"]
