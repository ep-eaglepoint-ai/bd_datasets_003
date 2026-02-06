
        # Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Default command can be anything or specifically the evaluation
CMD ["python", "evaluation/evaluation.py"]
