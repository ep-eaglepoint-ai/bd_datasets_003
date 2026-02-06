FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including serve
RUN npm ci --only=production && npm install -g serve

# Copy source code
COPY . .

# Build the app
RUN npm run build

EXPOSE 3000

CMD ["serve", "-s", "build", "-l", "3000"]
