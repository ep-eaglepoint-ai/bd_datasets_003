FROM node:18-alpine

WORKDIR /app

COPY repository_after/package.json ./

RUN npm install

COPY repository_after/ ./

ENV CI=true


CMD ["echo", "build success"]
