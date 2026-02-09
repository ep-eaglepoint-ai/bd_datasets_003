FROM node:24-alpine
WORKDIR /app

COPY tests/package*.json ./tests/
COPY repository_after/package*.json ./repository_after/

RUN npm --prefix tests ci
RUN npm --prefix repository_after ci

COPY . .
CMD ["node", "evaluation/evaluation.js"]
