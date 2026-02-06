FROM python:3.9-slim

WORKDIR /app

# Install dependencies if any (none really standard, but nice to have)
# We need pytest
RUN pip install pytest hypothesis

# Copy everything
COPY . /app

# Set pythonpath
ENV PYTHONPATH=/app

CMD ["/bin/bash"]
