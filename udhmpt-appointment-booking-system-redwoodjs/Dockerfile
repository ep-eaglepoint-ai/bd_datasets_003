FROM node:18

# Install deps early so layer is cached across code changes
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --silent || npm install --silent

# Copy rest of the source
COPY . .

# Default command for test image (overrideable by docker-compose)
CMD ["npm", "test", "--silent"]
