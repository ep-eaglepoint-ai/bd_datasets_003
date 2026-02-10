FROM golang:1.18

WORKDIR /app
COPY . /app

# Keep the image minimal; CodeBuild/host provides Docker + Compose.
# We only need a Go toolchain to run `go test` / `go run`.

CMD ["bash"]
