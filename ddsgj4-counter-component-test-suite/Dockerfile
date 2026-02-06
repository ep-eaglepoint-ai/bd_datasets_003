# Dockerfile for JavaScript/Jest testing

FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY repository_after/package*.json repository_after/

# Install dependencies
RUN npm install && cd repository_after && npm install

# Copy rest of the files
COPY . .
