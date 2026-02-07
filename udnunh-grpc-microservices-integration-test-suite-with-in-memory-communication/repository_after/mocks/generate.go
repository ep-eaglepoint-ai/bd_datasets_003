// Package mocks provides gomock-generated mock implementations for gRPC service clients.
// Generated using mockgen from github.com/golang/mock.
package mocks

//go:generate mockgen -destination=mock_user_client.go -package=mocks github.com/example/microservices/proto/user UserServiceClient,UserService_ListUsersClient
//go:generate mockgen -destination=mock_order_client.go -package=mocks github.com/example/microservices/proto/order OrderServiceClient,OrderService_ListOrdersClient
//go:generate mockgen -destination=mock_inventory_client.go -package=mocks github.com/example/microservices/proto/inventory InventoryServiceClient,InventoryService_WatchStockClient
