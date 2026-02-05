FROM golang:1.21-alpine AS go-base
RUN apk add --no-cache curl

FROM node:20-alpine AS node-base

FROM go-base
COPY --from=node-base /usr/lib /usr/lib
COPY --from=node-base /usr/local/lib /usr/local/lib
COPY --from=node-base /usr/local/include /usr/local/include
COPY --from=node-base /usr/local/bin /usr/local/bin

WORKDIR /app

COPY repository_after/frontend/package*.json ./repository_after/frontend/

RUN cd repository_after/frontend && npm install

COPY . .

CMD [ "echo", "build success" ]