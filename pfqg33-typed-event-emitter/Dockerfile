# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM node:20-slim

# Set working directory to root of container
WORKDIR /app

# Copy all files into container
COPY . .

# Install TypeScript globally
RUN npm install -g typescript

# Install dependencies in repository_after
WORKDIR /app/repository_after
RUN npm install

# Switch back to root for evaluation
WORKDIR /app





