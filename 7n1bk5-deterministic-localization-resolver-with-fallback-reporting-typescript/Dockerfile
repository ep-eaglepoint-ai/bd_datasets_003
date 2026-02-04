FROM node:20-alpine
WORKDIR /app
COPY . /app
WORKDIR /app
# Install dependencies from root package.json
RUN npm install

# Install Python 3 for evaluation script
RUN apk add --no-cache python3 py3-pip

# Default command
CMD ["/app/node_modules/.bin/ts-node", "--project", "tsconfig.json", "tests/localizationResolver.test.ts"]
