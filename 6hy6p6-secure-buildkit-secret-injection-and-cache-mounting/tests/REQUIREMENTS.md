1. Secret injection via RUN --mount=type=secret,id=ssh_key
2. No ARG / ENV for secrets
3. Git configured to use SSH with the injected secret
4. Go module cache via --mount=type=cache,target=/go/pkg/mod
5. Final image must be scratch or gcr.io/distroless/static
6. Use ARG TARGETOS and ARG TARGETARCH
7. Pass them to go build
8. CGO_ENABLED=0
9. Secret must not exist in final image
10. Cross-build for linux/amd64 and linux/arm64
