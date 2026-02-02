FROM golang:1.21-alpine

WORKDIR /app

# Copy go.mod
COPY go.mod ./
COPY go.sum* ./

# Download dependencies
RUN go mod download || true

# Copy source code
COPY . .

# Set environment
ENV CGO_ENABLED=0

# Default command
CMD ["go", "test", "-v", "./tests"]
