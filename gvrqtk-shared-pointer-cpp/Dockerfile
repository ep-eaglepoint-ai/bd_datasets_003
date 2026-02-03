FROM gcc:11 as builder

# Install build tools and valgrind for memory checking
RUN apt-get update && apt-get install -y \
    build-essential \
    valgrind \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create build directory
RUN mkdir -p /app/build

# Copy project files
COPY repository_after/ /app/repository_after/
COPY repository_before/ /app/repository_before/
COPY tests/ /app/tests/

# Default command
CMD ["bash"]