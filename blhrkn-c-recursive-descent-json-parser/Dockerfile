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

# No pytest needed anymore.
# We will compile the evaluation tool on run.

CMD ["g++", "-std=c++17", "evaluation/evaluation.cpp", "-o", "evaluation_runner", "&&", "./evaluation_runner"]
