FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy prisma schema for client generation
COPY repository_after/prisma ./repository_after/prisma/

# Generate Prisma client
RUN npx prisma generate --schema=./repository_after/prisma/schema.prisma

# Copy all files
COPY . .

# Set environment for tests
ENV NODE_ENV=test
ENV DATABASE_URL=file:./test.db

# Default command runs tests
CMD ["npm", "test"]
