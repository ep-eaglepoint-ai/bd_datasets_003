FROM node:18-alpine

WORKDIR /app

# Context is root, so copy from repository_after
COPY repository_after/package*.json ./
RUN npm install

COPY repository_after/ .
RUN npm run build

CMD ["npm", "start"]
