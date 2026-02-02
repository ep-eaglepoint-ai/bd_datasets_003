
        # Add your Dockerfile content here, e.g. for a Python project with pytest would be like:

        FROM golang:1.20-alpine

WORKDIR /app

# Install Python for evaluation
RUN apk add --no-cache python3 py3-pip git build-base

COPY . /app

# Initialize module if not exists
RUN if [ ! -f go.mod ]; then go mod init flowguard; fi
RUN go mod tidy
