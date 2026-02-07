FROM python:3.9-slim

WORKDIR /app

# Install dependencies if any (none really standard, but nice to have)
# Install dependencies
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy everything
COPY . /app

# Set pythonpath
ENV PYTHONPATH=/app

CMD ["/bin/bash"]
