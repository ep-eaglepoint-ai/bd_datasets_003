FROM golang:1.21-alpine

WORKDIR /app

# Install required packages
RUN apk add --no-cache git

# Copy go.mod files first for better caching
COPY repository_after/go.mod ./repository_after/
COPY tests/go.mod ./tests/

# Download dependencies and generate go.sum
WORKDIR /app/repository_after
RUN go mod download && go mod tidy

WORKDIR /app/tests
RUN go mod download && go mod tidy

# Copy all source files
WORKDIR /app
COPY . .

# Re-tidy with actual source code to ensure go.sum is complete
WORKDIR /app/repository_after
RUN go mod tidy

WORKDIR /app/tests
RUN go mod tidy

# Create reports directory
RUN mkdir -p /app/evaluation/reports

WORKDIR /app

# Set default command
CMD ["sh", "-c", "cd /app/tests && go test -v ./..."]