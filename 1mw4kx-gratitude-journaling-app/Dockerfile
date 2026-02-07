FROM node:20-slim
WORKDIR /app

RUN apt-get update && apt-get install -y openssl findutils && rm -rf /var/lib/apt/lists/*

ARG TARGET_REPO=repository_after
ENV TARGET_REPO=${TARGET_REPO}

COPY ./${TARGET_REPO}/package*.json ./${TARGET_REPO}/
RUN cd ./${TARGET_REPO} && npm install --legacy-peer-deps

COPY . .

RUN if [ -f "./${TARGET_REPO}/prisma/schema.prisma" ]; then \
      cd ./${TARGET_REPO} && npx prisma generate; \
    fi

CMD ["sh", "-c", "./${TARGET_REPO}/node_modules/.bin/vite-node tests/journal.test.ts"]
