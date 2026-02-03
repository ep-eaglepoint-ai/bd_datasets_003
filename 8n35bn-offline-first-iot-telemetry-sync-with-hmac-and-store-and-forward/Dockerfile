FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY repository_after ./repository_after
COPY tests ./tests

# Create empty database files
RUN touch repository_after/client_wal.db repository_after/server.db

CMD ["npm", "test"]
