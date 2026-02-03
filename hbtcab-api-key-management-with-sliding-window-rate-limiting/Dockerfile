FROM node:20-slim

WORKDIR /app

# Copy package*.json and install dependencies
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy source code
COPY . .

# Default command runs the after state
CMD ["node", "repository_after/app.js"]
