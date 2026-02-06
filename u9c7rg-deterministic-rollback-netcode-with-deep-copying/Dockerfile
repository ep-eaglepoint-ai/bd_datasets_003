FROM golang:1.20-alpine

WORKDIR /app

# Copy go module files
COPY repository_after/go.mod ./

# Copy source code
COPY repository_after/ ./repository_after/
COPY tests/ ./tests/

# Install Python for evaluation script
RUN apk add --no-cache python3

CMD ["go", "test", "-v", "./tests"]
