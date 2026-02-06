# Builder stage
FROM golang:1.21-alpine AS builder

# Set work directory
WORKDIR /app

# Install git for private module access
RUN apk add --no-cache git openssh-client

# Configure git to use SSH for GitHub
RUN git config --global url."ssh://git@github.com/".insteadOf "https://github.com/"

# Declare BuildKit-provided target platform arguments
ARG TARGETOS
ARG TARGETARCH

# Copy go.mod and go.sum for dependency resolution
COPY go.mod go.sum ./

# Inject SSH key and download Go modules with cache mount
# The secret mount and cache mount are used here.
RUN --mount=type=secret,id=ssh_key \
    --mount=type=cache,target=/go/pkg/mod \
    ssh-keyscan github.com >> /etc/ssh/ssh_known_hosts && \
    go mod download

# Copy the rest of the source code
COPY . .

# Perform deterministic cross-compilation
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -o /app/bin/secure-build ./main.go

# Final minimal stage
FROM gcr.io/distroless/static AS final

# Set work directory
WORKDIR /

# Copy root CA certificates from builder stage
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy compiled Go binary from builder stage
COPY --from=builder /app/bin/secure-build /usr/local/bin/secure-build

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/secure-build"]

# Tester stage for running verification tests
FROM python:3.11-slim AS tester

# Set work directory
WORKDIR /app

# Install Go for evaluation script
ARG TARGETARCH
RUN apt-get update && apt-get install -y wget && \
    GOARCH=$([ "$TARGETARCH" = "amd64" ] && echo "amd64" || echo "arm64") && \
    wget -q https://go.dev/dl/go1.21.0.linux-${GOARCH}.tar.gz && \
    tar -C /usr/local -xzf go1.21.0.linux-${GOARCH}.tar.gz && \
    rm go1.21.0.linux-${GOARCH}.tar.gz && \
    apt-get clean

ENV PATH="/usr/local/go/bin:${PATH}"

# Copy all files for testing
COPY . .

# Run all tests by default
CMD ["sh", "-c", "python3 tests/test_repo_structure.py && python3 tests/test_final_image.py && python3 tests/test_cross_build.py && python3 tests/test_go_cache.py && python3 tests/test_secret_injection.py && python3 tests/test_requirements_lock.py && python3 tests/test_go_payload.py"]
