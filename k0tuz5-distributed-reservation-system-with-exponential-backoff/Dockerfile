

FROM golang:1.22.2-alpine
RUN apk add --no-cache git bash
WORKDIR /app
COPY go.mod ./
RUN go mod tidy
COPY . .
RUN go build -o server ./repository_after/server
RUN go build -o client ./repository_after/client
RUN go build -o evaluator ./evaluation/evaluation.go

RUN chmod +x server client evaluator
