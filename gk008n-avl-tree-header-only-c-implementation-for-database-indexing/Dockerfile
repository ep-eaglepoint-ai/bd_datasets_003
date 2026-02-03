FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY . .
