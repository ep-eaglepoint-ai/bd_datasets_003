FROM golang:1.21-alpine

WORKDIR /app

# Install required packages
RUN apk add --no-cache git

# Copy all source files
COPY . .

# Initialize dependencies for repository_after
WORKDIR /app/repository_after
RUN go mod tidy

# Initialize dependencies for tests  
WORKDIR /app/tests
RUN go mod tidy

WORKDIR /app

# Set default command
CMD ["sh", "-c", "cd /app/tests && go mod tidy && go test -v ./..."]