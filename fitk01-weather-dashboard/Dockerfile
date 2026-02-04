FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV USE_MOCK=true
ENV NODE_ENV=test

CMD ["node", "evaluation/evaluation.js"]
