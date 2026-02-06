FROM node:20-slim

WORKDIR /app/repository_after

# Install deps (separate layer for caching)
COPY repository_after/package.json repository_after/package-lock.json ./
RUN npm ci

# App source
COPY repository_after/nest-cli.json repository_after/tsconfig.json repository_after/jest.config.js ./
COPY repository_after/src ./src

# Root-level tests folder (required by evaluator)
COPY tests /app/tests

# Evaluation runner
COPY evaluation /app/evaluation

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]
