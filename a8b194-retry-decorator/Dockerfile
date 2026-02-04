# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:
FROM python:3.11-slim
WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir -r requirements.txt
CMD ["pytest", "-q", "tests"]
