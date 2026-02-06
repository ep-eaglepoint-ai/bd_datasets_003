# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM node:18-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Default command runs the evaluation script
CMD ["node", "evaluation/evaluation.js"]