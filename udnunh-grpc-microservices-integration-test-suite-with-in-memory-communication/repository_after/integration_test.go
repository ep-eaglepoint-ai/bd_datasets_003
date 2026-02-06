package main

import (
	"context"
	"net"
	"sync"
	"testing"
	"time"

	inventorypb "github.com/example/microservices/proto/inventory"
	orderpb "github.com/example/microservices/proto/order"
	userpb "github.com/example/microservices/proto/user"
	"github.com/example/microservices/services/inventory"
	"github.com/example/microservices/services/order"
	"github.com/example/microservices/services/user"
	"github.com/stretchr/testify/suite"
	"go.uber.org/goleak"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

const bufSize = 1024 * 1024

type IntegrationTestSuite struct {
	suite.Suite
	userListener      *bufconn.Listener
	inventoryListener *bufconn.Listener
	orderListener     *bufconn.Listener
	userServer        *grpc.Server
	inventoryServer   *grpc.Server
	orderServer       *grpc.Server
	userConn          *grpc.ClientConn
	inventoryConn     *grpc.ClientConn
	orderConn         *grpc.ClientConn
	userClient        userpb.UserServiceClient
	inventoryClient   inventorypb.InventoryServiceClient
	orderClient       orderpb.OrderServiceClient
	userService       *user.Service
	inventoryService  *inventory.Service
	orderService      *order.Service
}

func (s *IntegrationTestSuite) SetupTest() {
	s.userListener = bufconn.Listen(bufSize)
	s.inventoryListener = bufconn.Listen(bufSize)
	s.orderListener = bufconn.Listen(bufSize)

	s.userService = user.NewService()
	s.inventoryService = inventory.NewService()
	s.orderService = order.NewService()

	s.userServer = grpc.NewServer()
	s.inventoryServer = grpc.NewServer()
	s.orderServer = grpc.NewServer()

	userpb.RegisterUserServiceServer(s.userServer, s.userService)
	inventorypb.RegisterInventoryServiceServer(s.inventoryServer, s.inventoryService)
	orderpb.RegisterOrderServiceServer(s.orderServer, s.orderService)

	go func() { s.userServer.Serve(s.userListener) }()
	go func() { s.inventoryServer.Serve(s.inventoryListener) }()
	go func() { s.orderServer.Serve(s.orderListener) }()

	ctx := context.Background()
	var err error
	s.userConn, err = grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return s.userListener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	s.Require().NoError(err)

	s.inventoryConn, err = grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return s.inventoryListener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	s.Require().NoError(err)

	s.orderConn, err = grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return s.orderListener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	s.Require().NoError(err)

	s.userClient = userpb.NewUserServiceClient(s.userConn)
	s.inventoryClient = inventorypb.NewInventoryServiceClient(s.inventoryConn)
	s.orderClient = orderpb.NewOrderServiceClient(s.orderConn)
}

func (s *IntegrationTestSuite) TearDownTest() {
	if s.userConn != nil {
		s.userConn.Close()
	}
	if s.inventoryConn != nil {
		s.inventoryConn.Close()
	}
	if s.orderConn != nil {
		s.orderConn.Close()
	}
	if s.userServer != nil {
		s.userServer.GracefulStop()
	}
	if s.inventoryServer != nil {
		s.inventoryServer.GracefulStop()
	}
	if s.orderServer != nil {
		s.orderServer.GracefulStop()
	}
	if s.userListener != nil {
		s.userListener.Close()
	}
	if s.inventoryListener != nil {
		s.inventoryListener.Close()
	}
	if s.orderListener != nil {
		s.orderListener.Close()
	}
}

func (s *IntegrationTestSuite) TestBufconnNoNetworkPorts() {
	s.NotNil(s.userListener)
	s.NotNil(s.inventoryListener)
	s.NotNil(s.orderListener)
	addr := s.userListener.Addr()
	s.NotNil(addr, "userListener should have a valid address")
	s.Equal("bufconn", addr.Network(), "should use bufconn network")
}

func (s *IntegrationTestSuite) TestUserServiceCRUD() {
	ctx := context.Background()

	created, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
		Email:    "test@example.com",
		Name:     "Test User",
		Password: "password123",
		Role:     "customer",
	})
	s.Require().NoError(err)
	s.NotEmpty(created.Id)
	s.Equal("test@example.com", created.Email)

	fetched, err := s.userClient.GetUser(ctx, &userpb.GetUserRequest{Id: created.Id})
	s.Require().NoError(err)
	s.Equal(created.Id, fetched.Id)

	updated, err := s.userClient.UpdateUser(ctx, &userpb.UpdateUserRequest{
		Id:   created.Id,
		Name: "Updated Name",
	})
	s.Require().NoError(err)
	s.Equal("Updated Name", updated.Name)

	deleteResp, err := s.userClient.DeleteUser(ctx, &userpb.DeleteUserRequest{Id: created.Id})
	s.Require().NoError(err)
	s.True(deleteResp.Success)

	_, err = s.userClient.GetUser(ctx, &userpb.GetUserRequest{Id: created.Id})
	s.Error(err)
	st, ok := status.FromError(err)
	s.True(ok)
	s.Equal(codes.NotFound, st.Code())
}

func (s *IntegrationTestSuite) TestGRPCErrorCodes() {
	ctx := context.Background()

	_, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{})
	st, _ := status.FromError(err)
	s.Equal(codes.InvalidArgument, st.Code())

	_, err = s.userClient.GetUser(ctx, &userpb.GetUserRequest{Id: "nonexistent"})
	st, _ = status.FromError(err)
	s.Equal(codes.NotFound, st.Code())

	_, err = s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
		Email: "dup@test.com", Name: "Test", Password: "pass",
	})
	s.Require().NoError(err)
	_, err = s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
		Email: "dup@test.com", Name: "Test2", Password: "pass2",
	})
	st, _ = status.FromError(err)
	s.Equal(codes.AlreadyExists, st.Code())

	_, err = s.userClient.Authenticate(ctx, &userpb.AuthRequest{
		Email: "wrong@test.com", Password: "wrong",
	})
	st, _ = status.FromError(err)
	s.Equal(codes.Unauthenticated, st.Code())
}

func (s *IntegrationTestSuite) TestListUsersStream() {
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		_, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
			Email:    "stream" + string(rune('0'+i)) + "@test.com",
			Name:     "Stream User",
			Password: "pass",
		})
		s.Require().NoError(err)
	}

	stream, err := s.userClient.ListUsers(ctx, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	count := 0
	for {
		_, err := stream.Recv()
		if err != nil {
			break
		}
		count++
	}
	s.Equal(5, count)
}

func (s *IntegrationTestSuite) TestStreamCancellation() {
	ctx, cancel := context.WithCancel(context.Background())

	for i := 0; i < 3; i++ {
		_, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
			Email:    "cancel" + string(rune('0'+i)) + "@test.com",
			Name:     "Cancel User",
			Password: "pass",
		})
		s.Require().NoError(err)
	}

	stream, err := s.userClient.ListUsers(ctx, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	_, err = stream.Recv()
	s.Require().NoError(err)

	cancel()
	time.Sleep(50 * time.Millisecond)

	_, err = stream.Recv()
	if err != nil {
		st, ok := status.FromError(err)
		if ok {
			s.True(st.Code() == codes.Canceled || st.Code() == codes.Unknown)
		}
	}
}

func (s *IntegrationTestSuite) TestContextDeadline() {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()
	time.Sleep(10 * time.Millisecond)

	_, err := s.userClient.GetUser(ctx, &userpb.GetUserRequest{Id: "test"})
	s.Error(err)
	st, ok := status.FromError(err)
	s.True(ok)
	s.Equal(codes.DeadlineExceeded, st.Code())
}

func (s *IntegrationTestSuite) TestMetadataPropagation() {
	ctx := context.Background()

	created, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
		Email: "meta@test.com", Name: "Meta User", Password: "pass",
	})
	s.Require().NoError(err)

	authResp, err := s.userClient.Authenticate(ctx, &userpb.AuthRequest{
		Email: "meta@test.com", Password: "pass",
	})
	s.Require().NoError(err)

	md := metadata.Pairs("authorization", "Bearer "+authResp.Token)
	ctxWithMD := metadata.NewOutgoingContext(ctx, md)

	fetched, err := s.userClient.GetUser(ctxWithMD, &userpb.GetUserRequest{Id: created.Id})
	s.Require().NoError(err)
	s.Equal(created.Id, fetched.Id)
}

func (s *IntegrationTestSuite) TestReservationWorkflow() {
	ctx := context.Background()

	_, err := s.inventoryClient.UpdateStock(ctx, &inventorypb.UpdateStockRequest{
		ProductId:      "prod-1",
		QuantityChange: 100,
		Reason:         "initial stock",
	})
	s.Require().NoError(err)

	stock, err := s.inventoryClient.GetStock(ctx, &inventorypb.GetStockRequest{ProductId: "prod-1"})
	s.Require().NoError(err)
	s.Equal(int32(100), stock.Available)
	s.Equal(int32(0), stock.Reserved)

	reserveResp, err := s.inventoryClient.ReserveStock(ctx, &inventorypb.ReserveRequest{
		ProductId: "prod-1",
		Quantity:  20,
		OrderId:   "order-1",
		ExpiresAt: time.Now().Add(1 * time.Hour).Unix(),
	})
	s.Require().NoError(err)
	s.True(reserveResp.Success)
	s.NotEmpty(reserveResp.ReservationId)

	stock, err = s.inventoryClient.GetStock(ctx, &inventorypb.GetStockRequest{ProductId: "prod-1"})
	s.Require().NoError(err)
	s.Equal(int32(80), stock.Available)
	s.Equal(int32(20), stock.Reserved)

	_, err = s.inventoryClient.ConfirmReservation(ctx, &inventorypb.ConfirmRequest{
		ReservationId: reserveResp.ReservationId,
	})
	s.Require().NoError(err)

	stock, err = s.inventoryClient.GetStock(ctx, &inventorypb.GetStockRequest{ProductId: "prod-1"})
	s.Require().NoError(err)
	s.Equal(int32(80), stock.Available)
	s.Equal(int32(0), stock.Reserved)
}

func (s *IntegrationTestSuite) TestReservationRelease() {
	ctx := context.Background()

	_, err := s.inventoryClient.UpdateStock(ctx, &inventorypb.UpdateStockRequest{
		ProductId:      "prod-release",
		QuantityChange: 50,
		Reason:         "initial",
	})
	s.Require().NoError(err)

	reserveResp, err := s.inventoryClient.ReserveStock(ctx, &inventorypb.ReserveRequest{
		ProductId: "prod-release",
		Quantity:  30,
		OrderId:   "order-cancel",
	})
	s.Require().NoError(err)
	s.True(reserveResp.Success)

	stock, err := s.inventoryClient.GetStock(ctx, &inventorypb.GetStockRequest{ProductId: "prod-release"})
	s.Require().NoError(err)
	s.Equal(int32(20), stock.Available)
	s.Equal(int32(30), stock.Reserved)

	_, err = s.inventoryClient.ReleaseReservation(ctx, &inventorypb.ReleaseRequest{
		ReservationId: reserveResp.ReservationId,
	})
	s.Require().NoError(err)

	stock, err = s.inventoryClient.GetStock(ctx, &inventorypb.GetStockRequest{ProductId: "prod-release"})
	s.Require().NoError(err)
	s.Equal(int32(50), stock.Available)
	s.Equal(int32(0), stock.Reserved)
}

func (s *IntegrationTestSuite) TestOrderStateMachine() {
	ctx := context.Background()

	order, err := s.orderClient.CreateOrder(ctx, &orderpb.CreateOrderRequest{
		UserId: "user-1",
		Items: []*orderpb.OrderItem{
			{ProductId: "p1", Quantity: 2, Price: 10.0},
		},
		ShippingAddress: "123 Test St",
	})
	s.Require().NoError(err)
	s.Equal("pending", order.Status)

	order, err = s.orderClient.UpdateOrderStatus(ctx, &orderpb.UpdateStatusRequest{
		Id:     order.Id,
		Status: "confirmed",
	})
	s.Require().NoError(err)
	s.Equal("confirmed", order.Status)

	order, err = s.orderClient.UpdateOrderStatus(ctx, &orderpb.UpdateStatusRequest{
		Id:     order.Id,
		Status: "shipped",
	})
	s.Require().NoError(err)
	s.Equal("shipped", order.Status)
}

func (s *IntegrationTestSuite) TestOrderInvalidTransition() {
	ctx := context.Background()

	order, err := s.orderClient.CreateOrder(ctx, &orderpb.CreateOrderRequest{
		UserId: "user-2",
		Items: []*orderpb.OrderItem{
			{ProductId: "p2", Quantity: 1, Price: 5.0},
		},
	})
	s.Require().NoError(err)

	_, err = s.orderClient.CancelOrder(ctx, &orderpb.CancelOrderRequest{
		Id:     order.Id,
		Reason: "changed mind",
	})
	s.Require().NoError(err)

	_, err = s.orderClient.UpdateOrderStatus(ctx, &orderpb.UpdateStatusRequest{
		Id:     order.Id,
		Status: "confirmed",
	})
	s.Error(err)
	st, ok := status.FromError(err)
	s.True(ok)
	s.Equal(codes.FailedPrecondition, st.Code())
}

func (s *IntegrationTestSuite) TestCrossServiceIntegration() {
	ctx := context.Background()

	userResp, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
		Email:    "integration@test.com",
		Name:     "Integration User",
		Password: "securepass",
		Role:     "customer",
	})
	s.Require().NoError(err)

	authResp, err := s.userClient.Authenticate(ctx, &userpb.AuthRequest{
		Email:    "integration@test.com",
		Password: "securepass",
	})
	s.Require().NoError(err)
	s.NotEmpty(authResp.Token)

	_, err = s.inventoryClient.UpdateStock(ctx, &inventorypb.UpdateStockRequest{
		ProductId:      "integration-prod",
		QuantityChange: 50,
		Reason:         "restock",
	})
	s.Require().NoError(err)

	order, err := s.orderClient.CreateOrder(ctx, &orderpb.CreateOrderRequest{
		UserId: userResp.Id,
		Items: []*orderpb.OrderItem{
			{ProductId: "integration-prod", Quantity: 5, Price: 25.0},
		},
		ShippingAddress: "456 Integration Ave",
	})
	s.Require().NoError(err)

	reserveResp, err := s.inventoryClient.ReserveStock(ctx, &inventorypb.ReserveRequest{
		ProductId: "integration-prod",
		Quantity:  5,
		OrderId:   order.Id,
	})
	s.Require().NoError(err)
	s.True(reserveResp.Success)

	paymentResp, err := s.orderClient.ProcessPayment(ctx, &orderpb.PaymentRequest{
		OrderId:       order.Id,
		PaymentMethod: "credit_card",
		PaymentToken:  "tok_test",
	})
	s.Require().NoError(err)
	s.True(paymentResp.Success)

	_, err = s.inventoryClient.ConfirmReservation(ctx, &inventorypb.ConfirmRequest{
		ReservationId: reserveResp.ReservationId,
	})
	s.Require().NoError(err)

	finalOrder, err := s.orderClient.GetOrder(ctx, &orderpb.GetOrderRequest{Id: order.Id})
	s.Require().NoError(err)
	s.Equal("confirmed", finalOrder.Status)

	finalStock, err := s.inventoryClient.GetStock(ctx, &inventorypb.GetStockRequest{ProductId: "integration-prod"})
	s.Require().NoError(err)
	s.Equal(int32(45), finalStock.Available)
	s.Equal(int32(0), finalStock.Reserved)
}

func (s *IntegrationTestSuite) TestParallelIsolation() {
	ctx := context.Background()

	var wg sync.WaitGroup
	results := make(chan string, 10)

	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			email := "parallel" + string(rune('0'+idx)) + "@test.com"
			user, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
				Email:    email,
				Name:     "Parallel User",
				Password: "pass",
			})
			if err == nil {
				results <- user.Id
			}
		}(i)
	}

	wg.Wait()
	close(results)

	ids := make(map[string]bool)
	for id := range results {
		s.False(ids[id], "duplicate ID found")
		ids[id] = true
	}
	s.Len(ids, 5)
}

func (s *IntegrationTestSuite) TestWatchStockStream() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	_, err := s.inventoryClient.UpdateStock(ctx, &inventorypb.UpdateStockRequest{
		ProductId:      "watch-prod",
		QuantityChange: 10,
	})
	s.Require().NoError(err)

	stream, err := s.inventoryClient.WatchStock(ctx, &inventorypb.WatchStockRequest{
		ProductIds: []string{"watch-prod"},
	})
	s.Require().NoError(err)

	updateReceived := make(chan bool, 1)
	go func() {
		for {
			_, err := stream.Recv()
			if err != nil {
				return
			}
			select {
			case updateReceived <- true:
			default:
			}
		}
	}()

	time.Sleep(50 * time.Millisecond)
	_, err = s.inventoryClient.UpdateStock(ctx, &inventorypb.UpdateStockRequest{
		ProductId:      "watch-prod",
		QuantityChange: 5,
	})
	s.Require().NoError(err)

	select {
	case <-updateReceived:
	case <-time.After(500 * time.Millisecond):
	}

	cancel()
	time.Sleep(50 * time.Millisecond)
}

func (s *IntegrationTestSuite) TestListOrdersStream() {
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		_, err := s.orderClient.CreateOrder(ctx, &orderpb.CreateOrderRequest{
			UserId: "stream-user",
			Items: []*orderpb.OrderItem{
				{ProductId: "p1", Quantity: 1, Price: 10.0},
			},
		})
		s.Require().NoError(err)
	}

	stream, err := s.orderClient.ListOrders(ctx, &orderpb.ListOrdersRequest{
		UserId: "stream-user",
	})
	s.Require().NoError(err)

	count := 0
	for {
		_, err := stream.Recv()
		if err != nil {
			break
		}
		count++
	}
	s.Equal(3, count)
}

func TestIntegrationSuite(t *testing.T) {
	defer goleak.VerifyNone(t)
	suite.Run(t, new(IntegrationTestSuite))
}
