FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files
COPY . /app

# Set Python path
ENV PYTHONPATH=/app/repository_after:/app

# Default command runs evaluation
CMD ["python", "evaluation/evaluation.py"]