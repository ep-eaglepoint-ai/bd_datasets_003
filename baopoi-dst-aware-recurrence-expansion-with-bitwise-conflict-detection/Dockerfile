FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

ENV PYTHONPATH=/app

# Default command - can be overridden
CMD ["python", "evaluation/run_evaluation.py"]