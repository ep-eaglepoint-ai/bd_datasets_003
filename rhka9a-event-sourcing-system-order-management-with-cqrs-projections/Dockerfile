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

# Copy evaluation Java file
COPY ../evaluation ./evaluation

# Build the application
RUN mvn compile -q -f pom.xml

# Build the evaluation class
RUN mkdir -p evaluation && javac -cp "$(mvn -q dependency:build-classpath -f pom.xml -Dmdep.outputFile=/dev/stdout):target/classes" -d evaluation evaluation/Evaluation.java

# Default command runs tests
CMD ["mvn", "test", "-f", "pom.xml"]
