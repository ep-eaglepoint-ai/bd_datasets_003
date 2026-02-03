
        # Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

        FROM node:20-alpine

WORKDIR /app

# Copy package.json from the repository_after folder
COPY repository_after/package*.json ./

# Install dependencies
RUN npm install

# Copy the source code from repository_after
COPY repository_after/ .

# Expose port
EXPOSE 3000

# Start command (can be overridden by docker-compose)
CMD ["npm", "run", "dev"]
