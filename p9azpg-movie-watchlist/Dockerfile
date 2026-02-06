# Use a Debian-based image
FROM node:22-bookworm

# Set working directory
WORKDIR /app

COPY repository_after/ .

RUN rm -rf node_modules

RUN npm ci

RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]