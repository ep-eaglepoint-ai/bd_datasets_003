FROM maven:3.9.6-eclipse-temurin-17-alpine

WORKDIR /workspace

# Copy only pom.xml events first to cache dependencies (if we were building the jar, but we are running tests)
# For this setup where we mount the volume, we just ensure Maven is present.

CMD ["mvn", "clean", "test"]
