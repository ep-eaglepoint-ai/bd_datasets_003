FROM node:20-alpine

WORKDIR /app

# Avoid npm update notices during runs by pinning a newer npm.
RUN npm install -g npm@11.8.0 --no-audit --no-fund

COPY package.json tsconfig.json ./
COPY repository_after ./repository_after
COPY repository_before ./repository_before
COPY tests ./tests

RUN npm install --no-audit --no-fund

CMD ["npm", "run", "test:after"]
