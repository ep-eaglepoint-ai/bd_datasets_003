# VOVB0F - Color palette tool: run tests and evaluation
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY vitest.config.ts tsconfig.tests.json* ./
COPY tests ./tests
COPY evaluation ./evaluation
COPY repository_after ./repository_after
COPY repository_before ./repository_before

RUN npm ci 2>/dev/null || npm install

# Default: run requirement tests
CMD ["npm", "test"]
