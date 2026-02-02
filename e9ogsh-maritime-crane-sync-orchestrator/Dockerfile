FROM maven:3.9-eclipse-temurin-17

WORKDIR /app

COPY . .

# Build the main project
RUN cd /app/repository_after && mvn clean install -DskipTests -q || true

# Build the evaluation project
RUN cd /app/evaluation && mvn clean package -DskipTests -q || true