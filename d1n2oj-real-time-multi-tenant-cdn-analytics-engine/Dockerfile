FROM golang:latest

WORKDIR /app

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 go build -ldflags="-w -s" -trimpath \
    -o /app/server ./repository_after/cmd/api

EXPOSE 8080

CMD ["/app/server"]
