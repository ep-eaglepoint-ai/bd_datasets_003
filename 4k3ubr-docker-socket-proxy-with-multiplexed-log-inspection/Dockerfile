FROM golang:1.21-alpine

WORKDIR /app

# Install tools
RUN apk --no-cache add ca-certificates

# Copy go.mod and go.sum
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy all source code
COPY repository_after/ ./repository_after/
COPY evaluation/ ./evaluation/
COPY repository_before/ ./repository_before/
COPY tests/ ./tests/

# Build binaries
RUN cd repository_after && go build -o /usr/local/bin/proxy .
RUN cd evaluation && go build -o /usr/local/bin/evaluation .

# Default command runs evaluation
CMD ["/usr/local/bin/evaluation"]