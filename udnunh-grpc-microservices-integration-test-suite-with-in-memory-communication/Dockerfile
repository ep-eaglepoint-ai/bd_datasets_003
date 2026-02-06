FROM golang:1.21
WORKDIR /app
RUN apt-get update && apt-get install -y protobuf-compiler && \
    go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.31.0 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3.0
COPY . .
RUN cd repository_after && \
    protoc --go_out=. --go_opt=paths=source_relative \
           --go-grpc_out=. --go-grpc_opt=paths=source_relative \
           proto/user/user.proto proto/inventory/inventory.proto proto/order/order.proto && \
    go mod tidy && go mod download
RUN cd tests && go mod tidy && go mod download
RUN cd evaluation && go mod tidy && go build -o /app/evaluation/runner .
ENTRYPOINT ["/app/evaluation/runner"]
