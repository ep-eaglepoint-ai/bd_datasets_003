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

# Copy dependencies to lib folder for runtime use
RUN mvn dependency:copy-dependencies -f pom.xml -DoutputDirectory=target/lib -q

# Build the evaluation class with proper package structure
RUN mkdir -p evaluation/com/example/evaluation && \
    javac -cp "$(mvn -q dependency:build-classpath -f pom.xml -Dmdep.outputFile=/dev/stdout):target/classes:target/lib/*" \
    -d evaluation evaluation/Evaluation.java

# Default command runs tests
CMD ["mvn", "test", "-f", "pom.xml"]
