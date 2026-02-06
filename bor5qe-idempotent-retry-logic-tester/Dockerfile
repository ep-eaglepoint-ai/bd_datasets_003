FROM node:18-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

ENV NODE_OPTIONS=--experimental-vm-modules

# Default command runs the new JS evaluation script
CMD ["node", "evaluation/evaluation.js"]