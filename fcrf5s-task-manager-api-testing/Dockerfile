# FCRF5S - task manager api testing

FROM node:20-slim

WORKDIR /app

# Copy only package manifests first for better caching
COPY repository_after/package*.json /app/repository_after/
COPY tests/package*.json /app/tests/

# Install dependencies (separately for repo_after + tests)
RUN cd /app/repository_after && npm ci || npm install
RUN cd /app/tests && npm ci || npm install

# Copy the rest
COPY . /app
