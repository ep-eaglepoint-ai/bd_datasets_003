# Use a lightweight Node image
FROM node:18-alpine
RUN echo "Using Dockerfile at /app/Dockerfile"

# Set working directory
WORKDIR /app

# --------------------------
# Step 1: Copy only package files for caching
# --------------------------
COPY repository_before/package*.json ./repository_before/
COPY repository_after/package*.json ./repository_after/

# --------------------------
# Step 2: Install dependencies
# --------------------------

# For repository_before, use npm ci (clean lockfile)
WORKDIR /app/repository_before
RUN npm ci --silent

# For repository_after, use npm install (tolerates dirty/mismatched lockfile)
WORKDIR /app/repository_after
RUN npm install --silent

# --------------------------
# Step 3: Copy full project files
# --------------------------
WORKDIR /app
COPY repository_before ./repository_before
COPY repository_after ./repository_after

# Copy evaluation script
COPY evaluation/evaluation.js ./evaluation/

# --------------------------
# Step 4: Default command
# --------------------------
CMD ["node", "evaluation/evaluation.js"]
