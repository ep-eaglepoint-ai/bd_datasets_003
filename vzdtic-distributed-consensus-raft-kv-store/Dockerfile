FROM golang:1.21-alpine

WORKDIR /app

# Install protobuf compiler
RUN apk add --no-cache protobuf protobuf-dev git make

# Install Go protobuf plugins
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
RUN go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy all files
COPY . /app

# Set Go path
ENV PATH="${PATH}:$(go env GOPATH)/bin"
ENV GOPATH=/go

# Default command runs evaluation
CMD ["go", "run", "evaluation/evaluation.go"]