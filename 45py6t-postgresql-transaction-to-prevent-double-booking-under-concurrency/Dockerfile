FROM python:3.11-slim

WORKDIR /app

# Install postgresql-client for psql availability if needed
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files
COPY . .

# Clear entrypoint to ensure we can run python directly
ENTRYPOINT []

# Default command to run the evaluation
CMD ["python", "evaluation/evaluation.py"]
