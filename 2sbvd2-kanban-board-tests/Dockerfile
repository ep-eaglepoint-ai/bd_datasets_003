FROM node:18-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=test

COPY repository_after/kanban_app/package.json /app/repository_after/kanban_app/package.json
COPY repository_after/kanban_app/package-lock.json /app/repository_after/kanban_app/package-lock.json

WORKDIR /app/repository_after/kanban_app
RUN npm ci --silent

WORKDIR /app
COPY repository_after/ /app/repository_after/
COPY tests/ /app/tests/
COPY jest.meta.config.js /app/jest.meta.config.js

CMD ["sh", "-lc", "node /app/repository_after/kanban_app/node_modules/jest/bin/jest.js --config /app/jest.meta.config.js --runInBand --silent"]
