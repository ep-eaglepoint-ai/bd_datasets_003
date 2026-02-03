# Dockerfile for the Event Sourcing Order Management System
FROM eclipse-temurin:17-jdk-alpine

# Install Maven
RUN apk add --no-cache maven

WORKDIR /app

# Copy Maven wrapper and project files from repository_after
COPY repository_after/mvnw ./mvnw
COPY repository_after/pom.xml ./pom.xml

# Copy source code
COPY repository_after/src ./src

# Copy tests from project root
COPY ../tests ./tests

# Build and test the application
CMD ["mvn", "test", "-f", "pom.xml"]
