FROM golang:1.21-alpine


RUN apk add --no-cache bash

WORKDIR /app


COPY go.mod ./
RUN go mod download || true


COPY . .


CMD ["go", "test", "-v", "./tests/..."]