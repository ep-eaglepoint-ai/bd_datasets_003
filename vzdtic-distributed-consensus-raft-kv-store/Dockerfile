FROM golang:1.21-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git make

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy all files
COPY . /app

# Build evaluation tool
RUN go build -o /app/evaluation/eval /app/evaluation/evaluation.go

# Default command
CMD ["go", "test", "-v", "./tests/..."]