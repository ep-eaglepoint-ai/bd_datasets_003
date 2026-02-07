FROM node:18-slim

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY babel.config.js ./
COPY jest.config.js ./
COPY jest.setup.js ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . /app

# Set NODE_ENV
ENV NODE_ENV=test

# Default command runs evaluation
CMD ["node", "evaluation/evaluation.js"]