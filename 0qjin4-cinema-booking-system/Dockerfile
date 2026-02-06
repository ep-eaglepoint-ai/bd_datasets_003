FROM gcc:13

# Install Google Test
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        cmake \
        libgtest-dev \
    && cd /usr/src/gtest && \
    cmake . && make && \
    cp lib/*.a /usr/lib/ && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app

# Build tests and run them (default to repository_after)
# Use REPO_DIR env var to switch: REPO_DIR=repository_before or REPO_DIR=repository_after
CMD ["bash", "-c", "cd tests && make clean && make REPO_DIR=${REPO_DIR:-repository_after} && make test"]
