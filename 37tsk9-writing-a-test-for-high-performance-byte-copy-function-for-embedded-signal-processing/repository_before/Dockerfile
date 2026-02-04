FROM alpine:3.19

# Install build dependencies
RUN apk add --no-cache \
    build-base \
    cmake

WORKDIR /app

# Copy source files (fast_copy.c, fast_copy.h, main.c, CMakeLists.txt)
COPY . .

# Build the application
RUN mkdir build && cd build && \
    cmake .. && \
    make

# Run the compiled binary
CMD ["./build/fast_copy_bin"]