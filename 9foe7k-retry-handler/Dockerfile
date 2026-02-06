# Multi-stage build for running tests
FROM maven:3.9-eclipse-temurin-17

WORKDIR /app

# Install python for evaluation script
RUN apt-get update && apt-get install -y python3 python3-pip

# Copy the pom.xml separately to allow caching of dependencies? 
# Actually, since tests are outside, we mount everything. 
# But let's copy pom to pre-download dependencies if we want to build the image efficiently.
COPY repository_after/pom.xml /app/repository_after/pom.xml

WORKDIR /app/repository_after
# Run dependency:go-offline to cache dependencies
RUN mvn dependency:go-offline

WORKDIR /app
# We will mount the source code at runtime to allow quick iteration
