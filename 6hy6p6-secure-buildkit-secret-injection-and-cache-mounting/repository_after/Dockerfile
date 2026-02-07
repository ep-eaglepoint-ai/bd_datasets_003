# syntax=docker/dockerfile:1.6

FROM --platform=$BUILDPLATFORM golang:1.21-alpine@sha256:2414035b086e3c42b99654c8b26e6f5b1b1598080d65fd03c7f499552ff4dc94 AS builder

WORKDIR /app

RUN apk add --no-cache git openssh-client ca-certificates

ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

COPY go.mod ./
COPY go.sum ./

RUN export GIT_CONFIG_GLOBAL=/tmp/gitconfig && \
    export GIT_CONFIG_NOSYSTEM=1 && \
    git config --file /tmp/gitconfig user.email "buildkit@example.com" && \
    git config --file /tmp/gitconfig user.name "buildkit" && \
    git config --file /tmp/gitconfig url."ssh://git@github.com/".insteadOf "https://github.com/"

RUN --mount=type=secret,id=ssh_key \
    --mount=type=cache,target=/go/pkg/mod \
    ssh-keyscan github.com >> /etc/ssh/ssh_known_hosts && \
    GIT_CONFIG_GLOBAL=/tmp/gitconfig \
    GIT_CONFIG_NOSYSTEM=1 \
    GOPRIVATE=github.com/private \
    GIT_SSH_COMMAND="ssh -i /run/secrets/ssh_key -o StrictHostKeyChecking=accept-new" \
    go mod download

COPY . /app

RUN --mount=type=secret,id=ssh_key \
    --mount=type=cache,target=/go/pkg/mod \
    mkdir -p /app/bin && \
    CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    GIT_CONFIG_GLOBAL=/tmp/gitconfig \
    GIT_CONFIG_NOSYSTEM=1 \
    GOPRIVATE=github.com/private \
    GIT_SSH_COMMAND="ssh -i /run/secrets/ssh_key -o StrictHostKeyChecking=accept-new" \
    go build -trimpath -buildvcs=false -o /app/bin/secure-build ./main.go

FROM gcr.io/distroless/static@sha256:972618ca78034aaddc55864342014a96b85108c607372f7cbd0dbd1361f1d841 AS final

WORKDIR /

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/bin/secure-build /usr/local/bin/secure-build

ENTRYPOINT ["/usr/local/bin/secure-build"]
