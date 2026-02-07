FROM maven:3.9-eclipse-temurin-11-alpine

WORKDIR /app

# Copy everything
COPY . /app

# Install Python 3 for evaluation script
RUN apk add --no-cache python3

# Pre-download maven dependencies to cache them (optional but good practice)
# We need to copy pom.xml specifically if we want to cache, but for now copying all is fine.
# RUN mvn dependency:go-offline
