FROM node:18-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Default runs the root Jest harness; override REPO_PATH via docker-compose/env.
CMD ["npm", "test"]