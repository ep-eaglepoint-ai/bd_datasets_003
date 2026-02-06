FROM golang:1.25-alpine
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY . .

RUN go mod tidy
ENV CGO_ENABLED=1