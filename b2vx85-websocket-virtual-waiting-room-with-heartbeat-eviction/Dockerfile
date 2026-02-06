FROM node:18-alpine

WORKDIR /app

# Install Python for evaluation
RUN apk add --no-cache python3 py3-pip

COPY . /app

CMD ["sh", "-c", "cd repository_after && npm install && npm test"]
