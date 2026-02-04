FROM node:20-alpine

WORKDIR /app/repository_after

ENV NEXT_TELEMETRY_DISABLED=1

COPY repository_after/package.json repository_after/package-lock.json ./
RUN npm ci

COPY repository_after ./

COPY tests ./tests

CMD ["npm", "--silent", "test"]
