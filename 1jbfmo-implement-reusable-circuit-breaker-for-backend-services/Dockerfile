FROM node:20-slim
WORKDIR /app
COPY package.json ./
COPY repository_after/package.json ./repository_after/
RUN npm install && cd repository_after && npm install
COPY . .
CMD ["node", "evaluation/evaluation.js"]
