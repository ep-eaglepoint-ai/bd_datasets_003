# Use a specific, stable version of Node
FROM node:20-slim

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
# This ensures npx and jest are available in the container
COPY package*.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Add node_modules/.bin to PATH just in case
ENV PATH /app/node_modules/.bin:$PATH