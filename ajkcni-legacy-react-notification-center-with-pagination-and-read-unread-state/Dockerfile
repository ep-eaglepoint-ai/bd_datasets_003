FROM node:20-slim

WORKDIR /app

# Copy package.json first to cache dependencies
# We assume package.json will be in repository_after/package.json, but the prompt says 
# "ALL implementation MUST live inside repository_after/". 
# Does that include the root package.json? 
# The directory structure shows `repository_after` is a subdirectory of the root.
# However, the docker-compose maps .:/app. 
# So we should probably install dependencies inside the container based on where they are.
# Let's assume the user wants the root to be the workspace.

# Install dependencies for evaluation (if any) and repository_after
# But wait, usually we copy everything.

COPY . /app

# Install dependencies in repository_after
WORKDIR /app/repository_after
RUN npm install

# Install dependencies for tests (if they are separate, but usually tests use the same package.json or a clean env)
# The tests are in /app/tests. They might need their own package.json or rely on repository_after.
# Given the prompt structure, tests usually import from repository_after.
# Let's ensure tests have access to dependencies.
# We might need to install dev dependencies in repository_after which include jest.

WORKDIR /app
