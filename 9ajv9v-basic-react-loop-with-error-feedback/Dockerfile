FROM python:3.11-slim
WORKDIR /app

# Copy and install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application code from current directory
COPY . /app/

CMD ["python", "-m", "pytest", "-q", "tests"]
