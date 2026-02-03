FROM maven:3.9-eclipse-temurin-17

WORKDIR /app

# Download JUnit dependencies
RUN mkdir -p /app/libs && \
    curl -L -o /app/libs/junit-platform-console-standalone-1.10.0.jar \
    https://repo1.maven.org/maven2/org/junit/platform/junit-platform-console-standalone/1.10.0/junit-platform-console-standalone-1.10.0.jar

COPY . .

# Build the main project
RUN cd /app/repository_after && mvn clean install -DskipTests -q || true