FROM golang:1.21-alpine

WORKDIR /app

RUN apk add --no-cache gcc musl-dev bash

COPY go.mod ./
COPY . .

# We run tidy and tests in docker-compose commands to handle host mounts
CMD ["sh", "-c", "echo 'Use docker-compose to run specific tests'"]
