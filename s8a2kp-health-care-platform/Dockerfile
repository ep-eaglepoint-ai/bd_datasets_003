
FROM node:20-alpine

WORKDIR /app

# Install system dependencies if needed
RUN apk add --no-cache git

# Copy root package files
COPY package.json ./

# Copy usage of workspaces if any, but for now we assume structured repo
# Copy the rest of the application code
COPY . .

# Install dependencies for server and client
# We can do this in the `test-after` or `evaluation` containers, 
# but doing it here saves time.
# However, `node_modules` might overwrite mounted volumes if not careful.
# For development/testing with volumes, we usually install in the entrypoint or 
# assume node_modules are present.
# But for a "build" it should be here.

# For this task, we'll install dependencies in the runtime or rely on pre-installation if possible.
# But to be safe and "dockerized", we should install.
RUN cd repository_after/server && npm install
RUN cd repository_after/client && npm install
# Also install root deps for evaluation if needed, though evaluation/evaluation.ts uses npx
# We might need to install top level deps if there are any.
RUN npm install

ENV NODE_ENV=test
