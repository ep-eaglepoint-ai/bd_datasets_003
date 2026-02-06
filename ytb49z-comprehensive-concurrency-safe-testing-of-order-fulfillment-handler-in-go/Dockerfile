
        FROM golang:1.22-alpine

        WORKDIR /app
        COPY . /app

        # Disable VCS stamping for reproducible builds.
        ENV GOFLAGS="-buildvcs=false"

        CMD ["sh", "-c", "echo 'Container ready. Use docker compose run --rm app <command>'"]
