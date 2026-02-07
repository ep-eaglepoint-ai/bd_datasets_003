FROM node:18

# Set working directory
WORKDIR /app

# Install root dependencies
COPY package.json package-lock.json* ./
RUN npm ci --silent || npm install --silent

# Install repository_after (Redwood workspace) dependencies
COPY repository_after/package.json repository_after/package-lock.json* ./repository_after/
COPY repository_after/api/package.json repository_after/api/package-lock.json* ./repository_after/api/
COPY repository_after/web/package.json ./repository_after/web/
RUN cd repository_after && npm install --silent --legacy-peer-deps

# Ensure API subpackage dependencies are installed so Prisma artifacts exist
RUN cd repository_after/api && npm install --silent --legacy-peer-deps || true

# Copy rest of the source
COPY . .

# Pre-generate Prisma client during build (requires API deps installed)
RUN cd repository_after && npx prisma generate --schema api/db/schema.prisma

# Default command
CMD ["npm", "test", "--silent"]
