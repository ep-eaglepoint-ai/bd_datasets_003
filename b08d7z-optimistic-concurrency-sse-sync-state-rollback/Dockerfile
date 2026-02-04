# Simplified Dockerfile for single container
FROM golang:1.21-alpine

RUN apk --no-cache add ca-certificates nodejs npm

WORKDIR /app

# Copy all source files
COPY . .

# Install frontend dependencies
RUN cd repository_after/frontend && npm install
RUN cd tests/ui && npm install

EXPOSE 8080

CMD ["sh", "-c", "cd repository_after/backend && go run main.go"]