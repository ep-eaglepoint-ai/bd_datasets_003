FROM golang:1.23-alpine

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

COPY . .

RUN [ -f go.mod ] || go mod init circuit-breaker-refactor

CMD ["go", "test", "-v", "-race", "./..."]
