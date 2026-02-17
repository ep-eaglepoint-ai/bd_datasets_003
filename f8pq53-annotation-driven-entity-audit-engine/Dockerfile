FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY repository_after/pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
	mvn dependency:go-offline
COPY repository_after/src ./src
RUN --mount=type=cache,target=/root/.m2 \
	mvn clean package -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/audit-engine-0.0.1-SNAPSHOT.jar app.jar
ENTRYPOINT ["java","-jar","app.jar"]
