# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM python:3.11-slim

# Install build tools and Catch2
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        make \
        bash \
        git \
        libcatch2-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything
COPY . .

# Install Python deps if present
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# Default command - run the main program
CMD ["./build/bin/record_processor"]