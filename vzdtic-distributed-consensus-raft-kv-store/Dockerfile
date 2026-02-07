FROM golang:1.22-alpine

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod ./
RUN go mod download || true

COPY . /app
RUN go mod tidy

CMD ["go", "run", "evaluation/evaluation.go"]