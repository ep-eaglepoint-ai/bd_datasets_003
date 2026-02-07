FROM node:18-alpine

WORKDIR /app

# Install basic utilities
RUN apk add --no-cache bash

# Copy the entire project
COPY . .

# Build argument to specify which repository to test
ARG TARGET_REPO=repository_after
ENV TARGET_REPO=${TARGET_REPO}

# Install dependencies if package.json exists
RUN if [ -f ${TARGET_REPO}/package.json ]; then \
        cd ${TARGET_REPO} && npm install; \
    else \
        echo "No package.json found in ${TARGET_REPO} - skipping install"; \
    fi

CMD ["sh", "-c", "cd ${TARGET_REPO} && npm test"]
