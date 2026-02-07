
        # Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

        
FROM python:3.11-slim
WORKDIR /app
COPY . /app
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt
# ENV PYTHONPATH="${PYTHONPATH}:/app"

# No ENTRYPOINT, let docker-compose override CMD/Entrypoint behavior naturally.
# Or if we want a default content:
CMD ["python3", "/app/evaluation/evaluation.py"]
