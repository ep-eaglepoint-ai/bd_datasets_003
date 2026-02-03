
        # Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

        FROM node:20

WORKDIR /app

COPY . .

# Install dependencies for legacy repo
WORKDIR /app/repository_before
RUN npm install

# Install dependencies for refactored repo
WORKDIR /app/repository_after
RUN npm install
RUN npm run build

# Install dependencies for tests
WORKDIR /app/tests
RUN npm install

WORKDIR /app
# Default command
CMD ["npm", "test", "--prefix", "tests"]

