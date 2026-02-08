# Dockerfile for the Event Sourcing Order Management System
FROM eclipse-temurin:17-jdk-alpine

# Install Maven
RUN apk add --no-cache maven

WORKDIR /app

# Copy Maven wrapper and project files
COPY repository_after/mvnw ./mvnw
COPY pom.xml ./pom.xml

# Copy source code module
COPY repository_after ./repository_after

# Copy tests from project root into the module's standard test source location
COPY tests ./repository_after/src/test/java

# Copy evaluation sources
COPY evaluation ./evaluation

# Build the application (compilation only; tests are run in the test container command)
RUN mvn compile -q -f pom.xml

# Compile evaluation class with proper package structure
# Create package directory structure and compile with Maven classpath
RUN mkdir -p evaluation/com/example/evaluation && \
    cp evaluation/Evaluation.java evaluation/com/example/evaluation/ && \
    CLASSPATH=$(mvn -q dependency:build-classpath -f pom.xml -Dmdep.outputFile=/dev/stdout 2>/dev/null | tr -d '\n' || echo '') && \
    javac -cp "${CLASSPATH}:target/classes" \
    -d evaluation evaluation/com/example/evaluation/Evaluation.java

# Default command runs the test suite
CMD ["mvn", "test", "-f", "pom.xml"]
