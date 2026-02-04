FROM golang:1.21-alpine

WORKDIR /app

# Install required packages
RUN apk add --no-cache git

# Copy go.mod files first for better caching
COPY repository_after/go.mod repository_after/go.sum* ./repository_after/
COPY tests/go.mod ./tests/

# Download dependencies
WORKDIR /app/repository_after
RUN go mod download 2>/dev/null || true

WORKDIR /app/tests
RUN go mod download 2>/dev/null || true

# Copy all source files
WORKDIR /app
COPY . .

# Tidy dependencies with actual source code
WORKDIR /app/repository_after
RUN go mod tidy

WORKDIR /app/tests
RUN go mod tidy

# Create reports directory
RUN mkdir -p /app/evaluation/reports

WORKDIR /app

# Set default command
CMD ["sh", "-c", "cd /app/tests && go test -v ./..."]