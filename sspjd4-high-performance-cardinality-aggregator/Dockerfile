FROM node:20-alpine

WORKDIR /app

# Create a root-level package.json that marks everything as ESM
RUN echo '{"type":"module"}' > /app/package.json

# Copy the specific package.json to install dependencies first (caching)
COPY repository_after/package*.json ./repository_after/
WORKDIR /app/repository_after
RUN npm install

# Go back to root and copy everything
WORKDIR /app
COPY . .

# Restore the root package.json in case COPY overwrote it
RUN if [ ! -f /app/package.json ] || ! grep -q '"type"' /app/package.json; then echo '{"type":"module"}' > /app/package.json; fi

# Set the working directory to where the package.json scripts are
WORKDIR /app/repository_after

CMD ["npm", "run", "dev"]

# FROM node:20-alpine

# WORKDIR /app

# # Copy everything first
# COPY . .

# # Install dependencies in repository_after
# WORKDIR /app/repository_after
# RUN npm install

# # Install dependencies in repository_before (if package.json exists)
# WORKDIR /app/repository_before
# RUN if [ -f package.json ]; then npm install; fi

# # Default to repository_after
# WORKDIR /app/repository_after

# CMD ["npm", "run", "dev"]