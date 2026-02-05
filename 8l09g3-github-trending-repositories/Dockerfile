FROM python:3.11-slim

WORKDIR /app

# Copy the entire project to the container
COPY . /app

# Install dependencies defined in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Run the script from the repository_after directory immediately on start
CMD ["python", "repository_after/script.py"]
