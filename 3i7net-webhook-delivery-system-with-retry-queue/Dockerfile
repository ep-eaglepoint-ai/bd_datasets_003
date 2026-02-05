FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY repository_after/go.mod ./
RUN go mod download 2>/dev/null || true

COPY repository_after/ ./

RUN CGO_ENABLED=0 GOOS=linux go build -o /webhook-server ./cmd/server

FROM alpine:3.19 AS production

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /webhook-server .

EXPOSE 8080

CMD ["./webhook-server"]

FROM golang:1.21-alpine AS test

WORKDIR /app/tests

RUN apk add --no-cache git gcc musl-dev

COPY tests/go.mod ./
COPY tests/*.go ./

RUN go mod tidy

ENV CGO_ENABLED=1

CMD ["go", "test", "-v", "-race", "-cover", "./..."]

FROM golang:1.21-alpine AS evaluation

RUN apk add --no-cache git gcc musl-dev

WORKDIR /app

COPY tests/ ./tests/
COPY evaluation/ ./evaluation/

RUN go mod init evaluation || true
RUN go get github.com/google/uuid

WORKDIR /app/tests
RUN go mod tidy

WORKDIR /app

CMD ["go", "run", "evaluation/evaluation.go"]
