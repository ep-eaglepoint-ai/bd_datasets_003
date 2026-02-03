FROM golang:1.23-alpine

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

COPY . .

# Initialize go mod if it doesn't exist
RUN [ -f go.mod ] || go mod init aggregator

CMD ["go", "test", "-v", "-race", "./..."]
