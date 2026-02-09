FROM node:18-alpine

WORKDIR /app

# Install dependencies needed for both backend and frontend
RUN apk add --no-cache bash

# Build arguments
ARG TARGET_REPO=repository_after
ENV TARGET_REPO=${TARGET_REPO}


COPY repository_after/package*.json ./repository_after/
RUN if [ -f repository_after/package.json ]; then \
        cd repository_after && npm install; \
    fi

COPY . .

RUN chmod +x evaluation/evaluation.js 2>/dev/null || true

CMD ["sh", "-c", "cd ${TARGET_REPO} && npm test"]
