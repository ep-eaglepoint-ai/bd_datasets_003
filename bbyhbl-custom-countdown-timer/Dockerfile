FROM node:18-slim

WORKDIR /app

# Install system dependencies for Prisma and PostgreSQL
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
RUN npm install

# Copy everything
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=repository_after/backend/prisma/schema.prisma

# Default command runs tests
CMD ["npm", "test"]