
FROM node:18-bookworm-slim

WORKDIR /app

COPY package.json /app/package.json

RUN cd /app && npm install

COPY repository_after /app/repository_after
COPY tests /app/tests

RUN cd /app && npm run build

ENV PORT=3000
ENV UPLOAD_DIR=/data/uploads
EXPOSE 3000

CMD ["node", "/app/repository_after/backend/dist/server.js"]
