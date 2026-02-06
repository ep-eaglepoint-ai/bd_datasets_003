FROM ubuntu:22.04

# Install dependencies including GTest, CMake, and JSON library
RUN apt-get update && apt-get install -y cmake g++ libgtest-dev nlohmann-json3-dev git

WORKDIR /app

# Copy repo
COPY . /app

# Build the project (tests and evaluator)
RUN mkdir -p build && cd build && cmake .. && make

# Entrypoint runs the C++ evaluation binary by default
ENTRYPOINT ["./build/evaluate"]
