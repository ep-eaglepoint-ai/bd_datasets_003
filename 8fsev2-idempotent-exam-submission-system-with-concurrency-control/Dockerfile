FROM golang:1.23-alpine

RUN apk add --no-cache gcc musl-dev

WORKDIR /app


ENV CGO_ENABLED=1

COPY go.mod ./
RUN go mod download || true

COPY . .


CMD ["go", "test", "-v", "./tests/...", "-race"]