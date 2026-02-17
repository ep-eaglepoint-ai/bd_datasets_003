FROM node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /app/repository_after

COPY repository_after/package.json repository_after/package-lock.json* ./
RUN npm install

COPY repository_after/prisma ./prisma
RUN npx prisma generate

COPY repository_after/tsconfig.json repository_after/tsconfig.jest.json repository_after/next-env.d.ts repository_after/next.config.js repository_after/jest.config.cjs ./
COPY repository_after/src ./src

WORKDIR /app
COPY tests ./tests

WORKDIR /app/repository_after

CMD ["npm", "test"]
