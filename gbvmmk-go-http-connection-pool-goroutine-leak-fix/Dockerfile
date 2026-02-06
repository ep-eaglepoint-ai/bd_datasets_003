FROM golang:1.21-alpine

# Install essential tools
RUN apk add --no-cache git

WORKDIR /app
COPY . /app

CMD ["go", "run", "evaluation/evaluation.go"]
