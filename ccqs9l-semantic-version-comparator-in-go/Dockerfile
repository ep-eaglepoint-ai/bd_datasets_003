

FROM golang:1.22.2-alpine
RUN apk add --no-cache git bash gcc musl-dev
WORKDIR /app
COPY go.mod ./
RUN go mod tidy
COPY . .

CMD [ "go", "run", "./evaluation/evaluator.go" ]