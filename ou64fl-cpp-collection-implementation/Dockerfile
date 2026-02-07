# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM alpine:3.19

# Install minimal packages
RUN apk add --no-cache \
    build-base \
    cmake \
    make \
    bash

WORKDIR /app

# Copy everything
COPY . .

# Create build directory and build
RUN mkdir -p build && \
    cd build && \
    cmake .. && \
    make

# Build evaluation binary for direct execution
RUN cmake -S evaluation -B evaluation/build && \
    cmake --build evaluation/build && \
    cp evaluation/build/evaluate evaluation/evaluate

# Default command - run the main program
CMD ["./build/bin/record_processor"]