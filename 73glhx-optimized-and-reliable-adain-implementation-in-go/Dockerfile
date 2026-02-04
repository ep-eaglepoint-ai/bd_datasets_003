# Use official Go image
FROM golang:1.25.5-alpine3.22

WORKDIR /app

COPY . .

ENV GOROOT=/usr/local/go
ENV PATH=/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

CMD ["bash"]

