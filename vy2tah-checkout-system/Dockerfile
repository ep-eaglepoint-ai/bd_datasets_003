# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM maven:3.9.6-eclipse-temurin-21

WORKDIR /app

COPY . .

RUN cd repository_before && mvn dependency:go-offline || true
RUN cd repository_after && mvn dependency:go-offline || true

RUN cd evaluation && javac Evaluation.java || true