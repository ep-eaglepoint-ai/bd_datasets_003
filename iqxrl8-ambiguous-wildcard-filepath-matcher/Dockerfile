FROM golang:1.22

WORKDIR /app

COPY go.mod ./
COPY repository_after ./repository_after
COPY tests ./tests
COPY evaluation ./evaluation

CMD ["go", "test", "./tests"]
