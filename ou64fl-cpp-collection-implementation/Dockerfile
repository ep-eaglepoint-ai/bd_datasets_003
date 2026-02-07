# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM ubuntu:22.04

# Install C++ build tools
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    g++ \
    make \
    bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything
COPY . .

# Debug: Show what's being built
RUN echo "Contents of /app:" && ls -la && \
    echo "CMakeLists.txt exists:" && [ -f CMakeLists.txt ] && echo "Yes" || echo "No"

# Default command - build and run evaluation
CMD ["bash", "-c", "echo 'REPO_PATH=$REPO_PATH' && mkdir -p build && cd build && cmake .. && make && ./bin/evaluate"]