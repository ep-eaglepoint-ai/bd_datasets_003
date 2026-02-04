FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN apk add --no-cache python3 py3-pip

CMD ["/app/node_modules/.bin/ts-node", "--project", "tsconfig.json", "tests/localizationResolver.test.ts"]
