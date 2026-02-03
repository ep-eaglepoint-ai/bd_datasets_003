FROM gcc:11 as builder

# Install build tools
RUN apt-get update && apt-get install -y \
    build-essential \
    valgrind \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create directories
RUN mkdir -p /app/build /app/evaluation

# Copy project files
COPY repository_after/ /app/repository_after/
COPY repository_before/ /app/repository_before/
COPY tests/ /app/tests/
COPY evaluation/ /app/evaluation/

# Default command
CMD ["bash"]