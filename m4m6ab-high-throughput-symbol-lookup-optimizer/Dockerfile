
FROM maven:3.9-eclipse-temurin-17

WORKDIR /app
COPY . /app

# Default command can be overridden by docker compose.
CMD ["mvn", "-q", "test"]
