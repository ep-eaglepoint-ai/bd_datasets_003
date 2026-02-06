# Dockerfile for running evaluation tests
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev dependencies for testing)
RUN npm install

# Copy the entire project
COPY . .

# Create evaluation output directory
RUN mkdir -p /app/evaluation

# Set the command to run evaluation
CMD ["npm", "run", "evaluate"]
