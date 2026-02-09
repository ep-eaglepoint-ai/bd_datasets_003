# Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

FROM node:20-slim

WORKDIR /project/repository_after/backend

COPY repository_after/backend/package*.json ./

# Install all dependencies including dev
RUN npm install --include=dev

# Copy everything
COPY . /project

# Run Jest in root /tests folder
CMD ["npx", "jest", "/project/tests/api.test.js", "--rootDir", "/project", "--moduleDirectories", "node_modules", "--moduleDirectories", "/project/repository_after/backend/node_modules"]