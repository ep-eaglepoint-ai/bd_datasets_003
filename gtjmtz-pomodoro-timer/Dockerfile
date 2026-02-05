FROM node:20-alpine

WORKDIR /app/repository_after

ENV NEXT_TELEMETRY_DISABLED=1

COPY repository_after/package.json repository_after/package-lock.json ./
RUN npm ci

# Root-level tests live at /app/tests. Create a root node_modules link so Vite can
# resolve dependencies when loading tests outside /app/repository_after.
RUN ln -s /app/repository_after/node_modules /app/node_modules

COPY repository_after ./

COPY tests /app/tests

COPY evaluation /app/evaluation

CMD ["npm", "--silent", "test"]
