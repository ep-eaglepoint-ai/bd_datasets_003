FROM node:18

WORKDIR /app

COPY repository_after/package.json repository_after/package-lock.json ./

RUN npm install

COPY repository_after/ ./

ENV CI=true

CMD ["echo", "build success"]
