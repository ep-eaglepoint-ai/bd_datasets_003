# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM gcc:13

# Install build tools and Google Test
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        cmake \
        make \
        libgtest-dev \
    && cd /usr/src/gtest && \
    cmake . && make && \
    cp lib/*.a /usr/lib/ && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

# Set permissions
RUN chmod +x /app/evaluation/evaluate.sh

# Default command: build and run tests
CMD ["bash", "-c", "cd /app/tests && make clean && make REPO_DIR=${REPO_DIR:-repository_after} && make test"]