FROM node:18-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Some CI wrappers invoke the container with `run ...` or even `node /app/run ...`.
# Provide a small runner on PATH to make those invocations work.
# Normalize CRLF in case the workspace is checked out on Windows.
RUN sed -i 's/\r$//' /app/run \
	&& printf '#!/bin/sh\nexec node /app/run "$@"\n' > /usr/local/bin/run \
	&& chmod +x /usr/local/bin/run

# Default runs the root Jest harness; override REPO_PATH via docker-compose/env.
CMD ["npm", "test"]