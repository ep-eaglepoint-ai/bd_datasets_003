FROM maven:3.9-eclipse-temurin-17-alpine

WORKDIR /app

# Install basic utilities
RUN apk add --no-cache bash

# Copy the entire project
COPY . .

# Build argument to specify which repository to test
ARG TARGET_REPO=repository_after
ENV TARGET_REPO=${TARGET_REPO}

# Compile the target repository if pom.xml exists
RUN cd ${TARGET_REPO} && \
    if [ -f pom.xml ]; then \
        mvn clean compile test-compile; \
    else \
        echo "No pom.xml found in ${TARGET_REPO} - skipping compilation"; \
    fi

CMD ["sh", "-c", "cd ${TARGET_REPO} && mvn test"]