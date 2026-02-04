FROM node:18-alpine

WORKDIR /app

RUN npm install -g jest@29.7.0 jest-environment-jsdom@29.7.0

COPY repository_after/backend/package*.json ./repository_after/backend/
COPY tests/package*.json ./tests/

RUN cd repository_after/backend && npm install
RUN cd tests && npm install

COPY . .

ENV USE_MOCK=true
ENV NODE_ENV=test

CMD ["node", "evaluation/evaluation.js"]
