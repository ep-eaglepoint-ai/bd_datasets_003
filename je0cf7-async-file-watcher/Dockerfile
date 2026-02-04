FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app

# Set Python path to include repository_after
ENV PYTHONPATH=/app/repository_after:/app

# Default command runs evaluation
CMD ["python", "evaluation/evaluation.py"]