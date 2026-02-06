FROM python:3.11-slim

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt /app/

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . /app/

# Make evaluation script executable
RUN chmod +x evaluation/evaluation.py

# Default command runs evaluation
CMD ["python3", "evaluation/evaluation.py"]
