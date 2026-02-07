# syntax=docker/dockerfile:1.6
# Builder stage
FROM --platform=$BUILDPLATFORM golang:1.21-alpine AS builder

# Set work directory
WORKDIR /app

# Install git and ca-certificates for private module access
RUN apk add --no-cache git openssh-client ca-certificates

# Declare BuildKit-provided platform arguments
ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

# Copy go.mod and go.sum for dependency resolution
COPY repository_after/go.mod ./
COPY repository_after/go.sum ./

# Configure git to prefer SSH for GitHub (required for private modules)
RUN export GIT_CONFIG_GLOBAL=/tmp/gitconfig && \
    export GIT_CONFIG_NOSYSTEM=1 && \
    git config --file /tmp/gitconfig user.email "buildkit@example.com" && \
    git config --file /tmp/gitconfig user.name "buildkit" && \
    git config --file /tmp/gitconfig url."ssh://git@github.com/".insteadOf "https://github.com/"

# Inject SSH key and download Go modules with cache mount
# The secret mount and cache mount are used here.
RUN --mount=type=secret,id=ssh_key \
    --mount=type=cache,target=/go/pkg/mod \
    ssh-keyscan github.com >> /etc/ssh/ssh_known_hosts && \
    rm -rf /go/pkg/mod/cache/vcs/* && \
    GIT_CONFIG_GLOBAL=/tmp/gitconfig \
    GIT_CONFIG_NOSYSTEM=1 \
    GOPRIVATE=github.com/private \
    GIT_SSH_COMMAND="ssh -i /run/secrets/ssh_key -o StrictHostKeyChecking=accept-new" \
    go mod download

# Copy the rest of the source code
COPY repository_after/ .

# Perform deterministic cross-compilation (secret mounted in case private modules are fetched at build time)
RUN --mount=type=secret,id=ssh_key \
    mkdir -p /app/bin && \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    GIT_CONFIG_GLOBAL=/tmp/gitconfig \
    GIT_CONFIG_NOSYSTEM=1 \
    GOPRIVATE=github.com/private \
    GIT_SSH_COMMAND="ssh -i /run/secrets/ssh_key -o StrictHostKeyChecking=accept-new" \
    go build -o /app/bin/secure-build ./main.go

# Tester stage for running validation inside docker-compose
FROM golang:1.21-alpine AS tester

WORKDIR /app

# Tools needed for tests and for invoking docker from inside the container
RUN apk add --no-cache openssh-client docker-cli docker-cli-buildx tar

COPY . /app

CMD ["sh", "-c", "go test ./tests"]

# Final minimal stage - DEFAULT TARGET
FROM gcr.io/distroless/static AS final

# Set work directory
WORKDIR /

# Copy root CA certificates from builder stage
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy compiled Go binary from builder stage
COPY --from=builder /app/bin/secure-build /usr/local/bin/secure-build

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/secure-build"]
