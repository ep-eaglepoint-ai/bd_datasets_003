FROM maven:3.9-eclipse-temurin-17-alpine

# Install Python 3
RUN apk add --no-cache python3 py3-pip bash

WORKDIR /app

# Copy everything
COPY . .

# Default command (overridden by docker-compose)
CMD ["bash"]
