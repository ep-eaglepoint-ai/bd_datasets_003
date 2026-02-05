FROM python:3.11-slim

# Install CMake and C++ compiler
RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    build-essential \
    time \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

# Install python dependencies (pytest)
RUN pip install --no-cache-dir pytest

# Create build directories
RUN mkdir -p repository_before/build && \
    mkdir -p repository_after/build

# We will build in the command script or entrypoint, 
# but for now let's make the CMD generic or specific to what docker-compose expects.
# The user wants "docker compose run --rm test-after".
# So the command should probably default to running tests with a target repo.

# Default command (can be overridden)
CMD ["pytest", "-q", "tests"]
