
FROM golang:latest AS builder

WORKDIR /app

# Copy only dependency files first (better cache usage)
COPY go.mod go.sum ./

# Download dependencies with retry and timeout settings
RUN --mount=type=cache,target=/go/pkg/mod \
    go env -w GOPROXY=https://proxy.golang.org,direct && \
    go env -w GOSUMDB=sum.golang.org && \
    go mod download

# Copy source code
COPY . .

# Build with cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -trimpath \
    -o /app/server ./repository_after/cmd/api

# Use distroless for minimal, secure runtime
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app

COPY --from=builder --chown=nonroot:nonroot /app/server /app/server

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/app/server"]
