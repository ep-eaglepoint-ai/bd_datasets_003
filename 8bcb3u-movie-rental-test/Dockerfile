FROM node:20-alpine

WORKDIR /app

# Copy the specific package.json to install dependencies first (caching)
COPY repository_after/package*.json ./repository_after/
WORKDIR /app/repository_after
RUN npm install

# Go back to root and copy everything
WORKDIR /app
COPY . .

# Set the working directory to where the package.json scripts are
WORKDIR /app/repository_after

CMD ["npm", "run", "dev"]
