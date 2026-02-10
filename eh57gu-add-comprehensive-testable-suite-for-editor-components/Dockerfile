FROM node:18-slim

WORKDIR /app

# Copy project files
COPY . .

# Install dependencies in repository_after
WORKDIR /app/repository_after
RUN npm install --legacy-peer-deps 2>/dev/null || npm install

# Back to root
WORKDIR /app

CMD ["npm", "test"]
