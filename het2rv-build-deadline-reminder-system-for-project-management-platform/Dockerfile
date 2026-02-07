FROM node:18-alpine

WORKDIR /app

# Copy root package files
COPY package.json tsconfig.json jest.config.js ./
COPY repository_after/package.json ./repository_after/
COPY repository_after/tsconfig.json ./repository_after/

# Install root dependencies
RUN npm install

# Install repository_after dependencies
WORKDIR /app/repository_after
RUN npm install

# Restore workspace root
WORKDIR /app

# Copy the rest of the application
COPY . .

# Build repository_after
WORKDIR /app/repository_after
RUN npm run build

WORKDIR /app

CMD ["npm", "start"]
