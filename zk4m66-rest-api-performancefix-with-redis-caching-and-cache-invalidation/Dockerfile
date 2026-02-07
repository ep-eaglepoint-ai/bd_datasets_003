FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=test

RUN apk add --no-cache openssl libc6-compat

COPY tests/package.json /app/tests/package.json
COPY tests/package-lock.json /app/tests/package-lock.json

WORKDIR /app/tests
RUN npm ci --silent --ignore-scripts

WORKDIR /app
COPY tests/ /app/tests/
COPY jest.meta.config.js /app/jest.meta.config.js
COPY evaluation/ /app/evaluation/

WORKDIR /app/tests
CMD ["npm", "test", "--silent"]
