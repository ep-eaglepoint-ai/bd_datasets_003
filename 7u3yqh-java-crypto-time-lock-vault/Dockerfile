FROM eclipse-temurin:17-jdk-alpine

WORKDIR /app

# Install Python for evaluation script
RUN apk add --no-cache python3 py3-pip

COPY . /app

# No specific CMD needed as docker-compose overrides it or we run specific commands

