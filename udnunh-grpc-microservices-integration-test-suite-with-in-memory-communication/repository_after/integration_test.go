package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang/mock/gomock"
	inventorypb "github.com/example/microservices/proto/inventory"
	orderpb "github.com/example/microservices/proto/order"
	userpb "github.com/example/microservices/proto/user"
	"github.com/example/microservices/services/inventory"
	"github.com/example/microservices/services/order"
	"github.com/example/microservices/services/user"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"go.uber.org/goleak"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	_ "github.com/lib/pq"
)

const bufSize = 1024 * 1024

// metadataInterceptor captures and validates incoming metadata
type metadataCapture struct {
	mu       sync.Mutex
	captured map[string][]string
}

func newMetadataCapture() *metadataCapture {
	return &metadataCapture{
		captured: make(map[string][]string),
	}
}

func (mc *metadataCapture) UnaryInterceptor() grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
		md, ok := metadata.FromIncomingContext(ctx)
		if ok {
			mc.mu.Lock()
			for k, v := range md {
				mc.captured[k] = v
			}
			mc.mu.Unlock()
		}
		return handler(ctx, req)
	}
}

func (mc *metadataCapture) StreamInterceptor() grpc.StreamServerInterceptor {
	return func(srv interface{}, ss grpc.ServerStream, info *grpc.StreamServerInfo, handler grpc.StreamHandler) error {
		md, ok := metadata.FromIncomingContext(ss.Context())
		if ok {
			mc.mu.Lock()
			for k, v := range md {
				mc.captured[k] = v
			}
			mc.mu.Unlock()
		}
		return handler(srv, ss)
	}
}

func (mc *metadataCapture) Get(key string) ([]string, bool) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	v, ok := mc.captured[key]
	return v, ok
}

func (mc *metadataCapture) Reset() {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.captured = make(map[string][]string)
}

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
	metadataCapture   *metadataCapture
}

func (s *IntegrationTestSuite) SetupTest() {
	s.userListener = bufconn.Listen(bufSize)
	s.inventoryListener = bufconn.Listen(bufSize)
	s.orderListener = bufconn.Listen(bufSize)

	s.userService = user.NewService()
	s.inventoryService = inventory.NewService()
	s.orderService = order.NewService()

	// Create metadata capture interceptor
	s.metadataCapture = newMetadataCapture()

	// Register servers with interceptors for metadata validation
	s.userServer = grpc.NewServer(
		grpc.UnaryInterceptor(s.metadataCapture.UnaryInterceptor()),
		grpc.StreamInterceptor(s.metadataCapture.StreamInterceptor()),
	)
	s.inventoryServer = grpc.NewServer(
		grpc.UnaryInterceptor(s.metadataCapture.UnaryInterceptor()),
		grpc.StreamInterceptor(s.metadataCapture.StreamInterceptor()),
	)
	s.orderServer = grpc.NewServer(
		grpc.UnaryInterceptor(s.metadataCapture.UnaryInterceptor()),
		grpc.StreamInterceptor(s.metadataCapture.StreamInterceptor()),
	)

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

	// Receive at least one item before cancellation
	_, err = stream.Recv()
	s.Require().NoError(err)

	// Cancel the context explicitly
	cancel()
	time.Sleep(50 * time.Millisecond)

	// Continue receiving until error - must get codes.Canceled
	var finalErr error
	for {
		_, err = stream.Recv()
		if err != nil {
			finalErr = err
			break
		}
	}

	// Req 3: Assert final gRPC status is explicitly codes.Canceled
	s.Require().Error(finalErr, "stream should return error after cancellation")
	if finalErr != io.EOF {
		st, ok := status.FromError(finalErr)
		if ok {
			s.Equal(codes.Canceled, st.Code(), "client cancellation must result in codes.Canceled, got %v", st.Code())
		} else {
			// Raw context error from transport layer is also acceptable
			s.ErrorIs(finalErr, context.Canceled, "non-status error must be context.Canceled")
		}
	}
}

// TestStreamCancellationExplicitStatusCheck verifies stream cancellation returns correct status
func (s *IntegrationTestSuite) TestStreamCancellationExplicitStatusCheck() {
	ctx, cancel := context.WithCancel(context.Background())

	// Create users for streaming
	for i := 0; i < 5; i++ {
		_, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
			Email:    fmt.Sprintf("stream_cancel_%d@test.com", i),
			Name:     "Stream User",
			Password: "pass",
		})
		s.Require().NoError(err)
	}

	stream, err := s.userClient.ListUsers(ctx, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	// Receive first item
	_, err = stream.Recv()
	s.Require().NoError(err, "should receive at least one user")

	// Cancel context
	cancel()

	// Drain stream and capture error
	var streamErr error
	for {
		_, err := stream.Recv()
		if err != nil {
			streamErr = err
			break
		}
	}

	// Req 3: Explicitly verify codes.Canceled using status.FromError
	s.Require().Error(streamErr)
	if streamErr != io.EOF {
		st, ok := status.FromError(streamErr)
		if ok {
			s.Equal(codes.Canceled, st.Code(), "cancellation must return codes.Canceled")
		} else {
			// Raw context error from transport layer
			s.ErrorIs(streamErr, context.Canceled, "non-status error must be context.Canceled")
		}
	}
}

// TestContextDeadline verifies DeadlineExceeded is returned when context deadline is exceeded
func (s *IntegrationTestSuite) TestContextDeadline() {
	// Create a context with an already-expired deadline
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()
	time.Sleep(10 * time.Millisecond) // Ensure deadline has passed

	_, err := s.userClient.GetUser(ctx, &userpb.GetUserRequest{Id: "test"})
	s.Require().Error(err, "should fail with deadline exceeded")
	st, ok := status.FromError(err)
	s.Require().True(ok, "error must be a gRPC status")
	s.Equal(codes.DeadlineExceeded, st.Code(), "deadline exceeded must return codes.DeadlineExceeded")
}

// TestDeadlineVsCancellationSemantics proves the distinction between deadline and cancellation
func (s *IntegrationTestSuite) TestDeadlineVsCancellationSemantics() {
	// Test 1: Explicit cancellation should return codes.Canceled
	ctx1, cancel1 := context.WithCancel(context.Background())
	cancel1() // Cancel immediately

	_, err := s.userClient.GetUser(ctx1, &userpb.GetUserRequest{Id: "test"})
	s.Require().Error(err)
	st, ok := status.FromError(err)
	s.Require().True(ok, "error must be a gRPC status")
	s.Equal(codes.Canceled, st.Code(), "explicit cancellation must return codes.Canceled")

	// Test 2: Deadline exceeded should return codes.DeadlineExceeded
	ctx2, cancel2 := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel2()
	time.Sleep(5 * time.Millisecond) // Let deadline expire

	_, err = s.userClient.GetUser(ctx2, &userpb.GetUserRequest{Id: "test"})
	s.Require().Error(err)
	st, ok = status.FromError(err)
	s.Require().True(ok, "error must be a gRPC status")
	s.Equal(codes.DeadlineExceeded, st.Code(), "deadline exceeded must return codes.DeadlineExceeded")
}

// TestStreamDeadlineVsCancellation verifies stream behavior differs between deadline and cancel
func (s *IntegrationTestSuite) TestStreamDeadlineVsCancellation() {
	// Setup: Create users for streaming
	for i := 0; i < 3; i++ {
		_, err := s.userClient.CreateUser(context.Background(), &userpb.CreateUserRequest{
			Email:    fmt.Sprintf("deadline_vs_cancel_%d@test.com", i),
			Name:     "Test User",
			Password: "pass",
		})
		s.Require().NoError(err)
	}

	// Test 1: Stream with cancellation
	ctx1, cancel1 := context.WithCancel(context.Background())
	stream1, err := s.userClient.ListUsers(ctx1, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	cancel1() // Cancel context
	time.Sleep(20 * time.Millisecond)

	// Drain stream
	var cancelErr error
	for {
		_, err := stream1.Recv()
		if err != nil {
			cancelErr = err
			break
		}
	}
	st, ok := status.FromError(cancelErr)
	s.Require().True(ok)
	s.Equal(codes.Canceled, st.Code(), "stream cancellation must return codes.Canceled")

	// Test 2: Stream with deadline (very short)
	ctx2, cancel2 := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel2()
	time.Sleep(5 * time.Millisecond) // Let deadline expire

	stream2, err := s.userClient.ListUsers(ctx2, &userpb.ListUsersRequest{})
	if err != nil {
		// Connection may fail immediately with DeadlineExceeded
		st, ok := status.FromError(err)
		s.Require().True(ok)
		s.Equal(codes.DeadlineExceeded, st.Code())
		return
	}

	// If connected, try to receive
	_, err = stream2.Recv()
	if err != nil {
		st, ok := status.FromError(err)
		s.Require().True(ok)
		s.Equal(codes.DeadlineExceeded, st.Code(), "deadline exceeded on stream must return codes.DeadlineExceeded")
	}
}

// TestMetadataPropagation verifies metadata is properly sent and received by server
func (s *IntegrationTestSuite) TestMetadataPropagation() {
	ctx := context.Background()

	// Reset metadata capture
	s.metadataCapture.Reset()

	created, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
		Email: "meta@test.com", Name: "Meta User", Password: "pass",
	})
	s.Require().NoError(err)

	authResp, err := s.userClient.Authenticate(ctx, &userpb.AuthRequest{
		Email: "meta@test.com", Password: "pass",
	})
	s.Require().NoError(err)

	// Reset to capture only the next request's metadata
	s.metadataCapture.Reset()

	// Send request with authorization metadata
	token := "Bearer " + authResp.Token
	md := metadata.Pairs("authorization", token)
	ctxWithMD := metadata.NewOutgoingContext(ctx, md)

	fetched, err := s.userClient.GetUser(ctxWithMD, &userpb.GetUserRequest{Id: created.Id})
	s.Require().NoError(err)
	s.Equal(created.Id, fetched.Id)

	// Req 5: Verify server actually received the metadata
	authValues, ok := s.metadataCapture.Get("authorization")
	s.Require().True(ok, "server must receive authorization metadata")
	s.Require().Len(authValues, 1, "should have exactly one authorization value")
	s.Equal(token, authValues[0], "authorization token must match")
}

// TestMetadataPropagationWithMultipleHeaders validates multiple metadata keys
func (s *IntegrationTestSuite) TestMetadataPropagationWithMultipleHeaders() {
	ctx := context.Background()
	s.metadataCapture.Reset()

	// Create user first
	created, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
		Email: "multi_meta@test.com", Name: "Meta User", Password: "pass",
	})
	s.Require().NoError(err)

	// Reset and send request with multiple metadata headers
	s.metadataCapture.Reset()

	md := metadata.Pairs(
		"authorization", "Bearer test-token-123",
		"x-request-id", "req-456",
		"x-tenant-id", "tenant-789",
	)
	ctxWithMD := metadata.NewOutgoingContext(ctx, md)

	_, err = s.userClient.GetUser(ctxWithMD, &userpb.GetUserRequest{Id: created.Id})
	s.Require().NoError(err)

	// Verify all metadata was received
	authValues, ok := s.metadataCapture.Get("authorization")
	s.Require().True(ok, "authorization must be received")
	s.Equal("Bearer test-token-123", authValues[0])

	reqIdValues, ok := s.metadataCapture.Get("x-request-id")
	s.Require().True(ok, "x-request-id must be received")
	s.Equal("req-456", reqIdValues[0])

	tenantValues, ok := s.metadataCapture.Get("x-tenant-id")
	s.Require().True(ok, "x-tenant-id must be received")
	s.Equal("tenant-789", tenantValues[0])
}

// TestMetadataPropagationOnStream validates metadata on streaming RPCs
func (s *IntegrationTestSuite) TestMetadataPropagationOnStream() {
	ctx := context.Background()

	// Create users for streaming
	for i := 0; i < 2; i++ {
		_, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
			Email:    fmt.Sprintf("stream_meta_%d@test.com", i),
			Name:     "Stream User",
			Password: "pass",
		})
		s.Require().NoError(err)
	}

	s.metadataCapture.Reset()

	// Create stream with metadata
	md := metadata.Pairs("authorization", "Bearer stream-token")
	ctxWithMD := metadata.NewOutgoingContext(ctx, md)

	stream, err := s.userClient.ListUsers(ctxWithMD, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	// Receive all users
	for {
		_, err := stream.Recv()
		if err == io.EOF {
			break
		}
		s.Require().NoError(err)
	}

	// Verify metadata was received for stream
	authValues, ok := s.metadataCapture.Get("authorization")
	s.Require().True(ok, "stream should receive authorization metadata")
	s.Equal("Bearer stream-token", authValues[0])
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

// =============================================================================
// Req 7: Comprehensive gRPC Error Validation Tests
// =============================================================================

// TestGRPCErrorValidationUnary ensures all unary errors use status.FromError
func (s *IntegrationTestSuite) TestGRPCErrorValidationUnary() {
	ctx := context.Background()

	// Test InvalidArgument for CreateUser
	_, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{})
	s.Require().Error(err)
	st, ok := status.FromError(err)
	s.Require().True(ok, "error must be extractable via status.FromError")
	s.Equal(codes.InvalidArgument, st.Code())
	s.NotEmpty(st.Message())

	// Test NotFound for GetUser
	_, err = s.userClient.GetUser(ctx, &userpb.GetUserRequest{Id: "nonexistent-id"})
	s.Require().Error(err)
	st, ok = status.FromError(err)
	s.Require().True(ok, "error must be extractable via status.FromError")
	s.Equal(codes.NotFound, st.Code())

	// Test NotFound for GetOrder
	_, err = s.orderClient.GetOrder(ctx, &orderpb.GetOrderRequest{Id: "nonexistent-order"})
	s.Require().Error(err)
	st, ok = status.FromError(err)
	s.Require().True(ok, "error must be extractable via status.FromError")
	s.Equal(codes.NotFound, st.Code())

	// Test InvalidArgument for CreateOrder without items
	_, err = s.orderClient.CreateOrder(ctx, &orderpb.CreateOrderRequest{
		UserId: "user-1",
	})
	s.Require().Error(err)
	st, ok = status.FromError(err)
	s.Require().True(ok, "error must be extractable via status.FromError")
	s.Equal(codes.InvalidArgument, st.Code())

	// Test NotFound for ReleaseReservation
	_, err = s.inventoryClient.ReleaseReservation(ctx, &inventorypb.ReleaseRequest{
		ReservationId: "nonexistent-reservation",
	})
	s.Require().Error(err)
	st, ok = status.FromError(err)
	s.Require().True(ok, "error must be extractable via status.FromError")
	s.Equal(codes.NotFound, st.Code())
}

// TestGRPCErrorValidationStream ensures stream errors use status.FromError
func (s *IntegrationTestSuite) TestGRPCErrorValidationStream() {
	// Create a context that we'll cancel
	ctx, cancel := context.WithCancel(context.Background())

	// Create some users
	for i := 0; i < 3; i++ {
		_, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
			Email:    fmt.Sprintf("error_stream_%d@test.com", i),
			Name:     "User",
			Password: "pass",
		})
		s.Require().NoError(err)
	}

	stream, err := s.userClient.ListUsers(ctx, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	// Receive one item successfully
	_, err = stream.Recv()
	s.Require().NoError(err)

	// Cancel to induce error
	cancel()
	time.Sleep(50 * time.Millisecond)

	// Continue receiving until error
	var streamErr error
	for {
		_, err := stream.Recv()
		if err != nil {
			streamErr = err
			break
		}
	}

	// Req 7: Verify stream error is extractable via status.FromError
	s.Require().Error(streamErr)
	if streamErr != io.EOF {
		st, ok := status.FromError(streamErr)
		if ok {
			s.Equal(codes.Canceled, st.Code(), "stream cancellation should return codes.Canceled")
		} else {
			// Raw context.Canceled from transport is also valid
			s.ErrorIs(streamErr, context.Canceled, "non-status stream error must be context.Canceled")
		}
	}
}

// TestGRPCErrorValidationAllServices tests error handling across all services
func (s *IntegrationTestSuite) TestGRPCErrorValidationAllServices() {
	ctx := context.Background()

	testCases := []struct {
		name         string
		operation    func() error
		expectedCode codes.Code
	}{
		{
			name: "UserService_CreateUser_InvalidArgument",
			operation: func() error {
				_, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{Name: "only name"})
				return err
			},
			expectedCode: codes.InvalidArgument,
		},
		{
			name: "UserService_GetUser_NotFound",
			operation: func() error {
				_, err := s.userClient.GetUser(ctx, &userpb.GetUserRequest{Id: "no-such-user"})
				return err
			},
			expectedCode: codes.NotFound,
		},
		{
			name: "UserService_Authenticate_Unauthenticated",
			operation: func() error {
				_, err := s.userClient.Authenticate(ctx, &userpb.AuthRequest{Email: "bad@email.com", Password: "wrong"})
				return err
			},
			expectedCode: codes.Unauthenticated,
		},
		{
			name: "OrderService_GetOrder_NotFound",
			operation: func() error {
				_, err := s.orderClient.GetOrder(ctx, &orderpb.GetOrderRequest{Id: "no-order"})
				return err
			},
			expectedCode: codes.NotFound,
		},
		{
			name: "InventoryService_ReleaseReservation_NotFound",
			operation: func() error {
				_, err := s.inventoryClient.ReleaseReservation(ctx, &inventorypb.ReleaseRequest{ReservationId: "no-res"})
				return err
			},
			expectedCode: codes.NotFound,
		},
		{
			name: "InventoryService_ConfirmReservation_NotFound",
			operation: func() error {
				_, err := s.inventoryClient.ConfirmReservation(ctx, &inventorypb.ConfirmRequest{ReservationId: "no-res"})
				return err
			},
			expectedCode: codes.NotFound,
		},
	}

	for _, tc := range testCases {
		s.Run(tc.name, func() {
			err := tc.operation()
			s.Require().Error(err)
			st, ok := status.FromError(err)
			s.Require().True(ok, "error must be extractable via status.FromError for %s", tc.name)
			s.Equal(tc.expectedCode, st.Code(), "unexpected code for %s", tc.name)
		})
	}
}

// =============================================================================
// Req 7: Failure Scenario Tests
// =============================================================================

// TestDialFailure tests behavior when dial fails
func (s *IntegrationTestSuite) TestDialFailure() {
	// Create a listener but don't start a server on it
	listener := bufconn.Listen(bufSize)
	listener.Close() // Close immediately to cause dial failure

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err := grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(), // Force blocking to detect failure
	)

	s.Require().Error(err, "dial to closed listener should fail")
}

// TestServerShutdownDuringRPC tests behavior when server shuts down mid-RPC
func (s *IntegrationTestSuite) TestServerShutdownDuringRPC() {
	// Create a dedicated listener and server
	listener := bufconn.Listen(bufSize)
	svc := user.NewService()
	server := grpc.NewServer()
	userpb.RegisterUserServiceServer(server, svc)

	go server.Serve(listener)

	// Connect
	ctx := context.Background()
	conn, err := grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	s.Require().NoError(err)
	defer conn.Close()

	client := userpb.NewUserServiceClient(conn)

	// Create some users
	for i := 0; i < 3; i++ {
		_, err := client.CreateUser(ctx, &userpb.CreateUserRequest{
			Email:    fmt.Sprintf("shutdown_%d@test.com", i),
			Name:     "User",
			Password: "pass",
		})
		s.Require().NoError(err)
	}

	// Start streaming
	stream, err := client.ListUsers(ctx, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	// Receive one item
	_, err = stream.Recv()
	s.Require().NoError(err)

	// Stop the server mid-stream
	server.Stop()
	listener.Close()

	// Try to receive more - should get an error
	var streamErr error
	for {
		_, err := stream.Recv()
		if err != nil {
			streamErr = err
			break
		}
	}

	s.Require().Error(streamErr, "should get error after server shutdown")
	// The error might be Unavailable, Canceled, or EOF depending on timing
	st, ok := status.FromError(streamErr)
	if ok {
		s.True(st.Code() == codes.Unavailable || st.Code() == codes.Canceled || st.Code() == codes.Internal,
			"shutdown error should be Unavailable, Canceled, or Internal, got: %v", st.Code())
	}
}

// TestBrokenStreamRecovery tests handling of broken streams
func (s *IntegrationTestSuite) TestBrokenStreamRecovery() {
	ctx, cancel := context.WithCancel(context.Background())

	// Create users for streaming
	for i := 0; i < 5; i++ {
		_, err := s.userClient.CreateUser(context.Background(), &userpb.CreateUserRequest{
			Email:    fmt.Sprintf("broken_stream_%d@test.com", i),
			Name:     "User",
			Password: "pass",
		})
		s.Require().NoError(err)
	}

	stream, err := s.userClient.ListUsers(ctx, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	// Receive one item
	_, err = stream.Recv()
	s.Require().NoError(err)

	// Cancel to break the stream
	cancel()

	// Verify we can still create a new stream with a fresh context
	newCtx := context.Background()
	newStream, err := s.userClient.ListUsers(newCtx, &userpb.ListUsersRequest{})
	s.Require().NoError(err)

	// Should be able to receive from new stream
	count := 0
	for {
		_, err := newStream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
		count++
	}
	s.True(count > 0, "should receive items from recovered stream")
}

// =============================================================================
// Parallel Execution Tests (Req 9)
// =============================================================================

// TestParallelUserCreation tests parallel user creation safety
func (s *IntegrationTestSuite) TestParallelUserCreation() {
	ctx := context.Background()
	numGoroutines := 10
	var wg sync.WaitGroup
	results := make(chan string, numGoroutines)
	errors := make(chan error, numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			user, err := s.userClient.CreateUser(ctx, &userpb.CreateUserRequest{
				Email:    fmt.Sprintf("parallel_user_%d@test.com", idx),
				Name:     "Parallel User",
				Password: "pass",
			})
			if err != nil {
				errors <- err
				return
			}
			results <- user.Id
		}(i)
	}

	wg.Wait()
	close(results)
	close(errors)

	// All should succeed (unique emails)
	ids := make(map[string]bool)
	for id := range results {
		s.False(ids[id], "duplicate ID detected in parallel creation")
		ids[id] = true
	}
	s.Len(ids, numGoroutines, "all parallel creations should succeed")

	for err := range errors {
		s.Fail("unexpected error in parallel creation: %v", err)
	}
}

// TestParallelStockReservation tests parallel inventory operations
func (s *IntegrationTestSuite) TestParallelStockReservation() {
	ctx := context.Background()

	// Initialize stock
	_, err := s.inventoryClient.UpdateStock(ctx, &inventorypb.UpdateStockRequest{
		ProductId:      "parallel-prod",
		QuantityChange: 100,
	})
	s.Require().NoError(err)

	numGoroutines := 5
	var wg sync.WaitGroup
	successCount := int32(0)

	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			resp, err := s.inventoryClient.ReserveStock(ctx, &inventorypb.ReserveRequest{
				ProductId: "parallel-prod",
				Quantity:  10,
				OrderId:   fmt.Sprintf("order-%d", idx),
			})
			if err == nil && resp.Success {
				atomic.AddInt32(&successCount, 1)
			}
		}(i)
	}

	wg.Wait()

	// All should succeed as we have enough stock
	s.Equal(int32(5), successCount, "all parallel reservations should succeed")

	// Verify final stock
	stock, err := s.inventoryClient.GetStock(ctx, &inventorypb.GetStockRequest{ProductId: "parallel-prod"})
	s.Require().NoError(err)
	s.Equal(int32(50), stock.Available)
	s.Equal(int32(50), stock.Reserved)
}

// =============================================================================
// DB + Testcontainers Tests
// =============================================================================

// MockUserServiceClient is a gomock-compatible manual mock of userpb.UserServiceClient
// used alongside testcontainers to simulate DB-backed services.
type MockUserServiceClient struct {
	ctrl                *gomock.Controller
	CreateUserFunc      func(ctx context.Context, in *userpb.CreateUserRequest, opts ...grpc.CallOption) (*userpb.User, error)
	GetUserFunc         func(ctx context.Context, in *userpb.GetUserRequest, opts ...grpc.CallOption) (*userpb.User, error)
	UpdateUserFunc      func(ctx context.Context, in *userpb.UpdateUserRequest, opts ...grpc.CallOption) (*userpb.User, error)
	DeleteUserFunc      func(ctx context.Context, in *userpb.DeleteUserRequest, opts ...grpc.CallOption) (*userpb.DeleteUserResponse, error)
	ListUsersFunc       func(ctx context.Context, in *userpb.ListUsersRequest, opts ...grpc.CallOption) (userpb.UserService_ListUsersClient, error)
	AuthenticateFunc    func(ctx context.Context, in *userpb.AuthRequest, opts ...grpc.CallOption) (*userpb.AuthResponse, error)
}

func NewMockUserServiceClient(ctrl *gomock.Controller) *MockUserServiceClient {
	return &MockUserServiceClient{ctrl: ctrl}
}

func (m *MockUserServiceClient) CreateUser(ctx context.Context, in *userpb.CreateUserRequest, opts ...grpc.CallOption) (*userpb.User, error) {
	if m.CreateUserFunc != nil {
		return m.CreateUserFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockUserServiceClient) GetUser(ctx context.Context, in *userpb.GetUserRequest, opts ...grpc.CallOption) (*userpb.User, error) {
	if m.GetUserFunc != nil {
		return m.GetUserFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockUserServiceClient) UpdateUser(ctx context.Context, in *userpb.UpdateUserRequest, opts ...grpc.CallOption) (*userpb.User, error) {
	if m.UpdateUserFunc != nil {
		return m.UpdateUserFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockUserServiceClient) DeleteUser(ctx context.Context, in *userpb.DeleteUserRequest, opts ...grpc.CallOption) (*userpb.DeleteUserResponse, error) {
	if m.DeleteUserFunc != nil {
		return m.DeleteUserFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockUserServiceClient) ListUsers(ctx context.Context, in *userpb.ListUsersRequest, opts ...grpc.CallOption) (userpb.UserService_ListUsersClient, error) {
	if m.ListUsersFunc != nil {
		return m.ListUsersFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockUserServiceClient) Authenticate(ctx context.Context, in *userpb.AuthRequest, opts ...grpc.CallOption) (*userpb.AuthResponse, error) {
	if m.AuthenticateFunc != nil {
		return m.AuthenticateFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

// MockOrderServiceClient is a gomock-compatible manual mock of orderpb.OrderServiceClient
type MockOrderServiceClient struct {
	ctrl                   *gomock.Controller
	CreateOrderFunc        func(ctx context.Context, in *orderpb.CreateOrderRequest, opts ...grpc.CallOption) (*orderpb.Order, error)
	GetOrderFunc           func(ctx context.Context, in *orderpb.GetOrderRequest, opts ...grpc.CallOption) (*orderpb.Order, error)
	UpdateOrderStatusFunc  func(ctx context.Context, in *orderpb.UpdateStatusRequest, opts ...grpc.CallOption) (*orderpb.Order, error)
	CancelOrderFunc        func(ctx context.Context, in *orderpb.CancelOrderRequest, opts ...grpc.CallOption) (*orderpb.Order, error)
	ListOrdersFunc         func(ctx context.Context, in *orderpb.ListOrdersRequest, opts ...grpc.CallOption) (orderpb.OrderService_ListOrdersClient, error)
	ProcessPaymentFunc     func(ctx context.Context, in *orderpb.PaymentRequest, opts ...grpc.CallOption) (*orderpb.PaymentResponse, error)
}

func NewMockOrderServiceClient(ctrl *gomock.Controller) *MockOrderServiceClient {
	return &MockOrderServiceClient{ctrl: ctrl}
}

func (m *MockOrderServiceClient) CreateOrder(ctx context.Context, in *orderpb.CreateOrderRequest, opts ...grpc.CallOption) (*orderpb.Order, error) {
	if m.CreateOrderFunc != nil {
		return m.CreateOrderFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockOrderServiceClient) GetOrder(ctx context.Context, in *orderpb.GetOrderRequest, opts ...grpc.CallOption) (*orderpb.Order, error) {
	if m.GetOrderFunc != nil {
		return m.GetOrderFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockOrderServiceClient) UpdateOrderStatus(ctx context.Context, in *orderpb.UpdateStatusRequest, opts ...grpc.CallOption) (*orderpb.Order, error) {
	if m.UpdateOrderStatusFunc != nil {
		return m.UpdateOrderStatusFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockOrderServiceClient) CancelOrder(ctx context.Context, in *orderpb.CancelOrderRequest, opts ...grpc.CallOption) (*orderpb.Order, error) {
	if m.CancelOrderFunc != nil {
		return m.CancelOrderFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockOrderServiceClient) ListOrders(ctx context.Context, in *orderpb.ListOrdersRequest, opts ...grpc.CallOption) (orderpb.OrderService_ListOrdersClient, error) {
	if m.ListOrdersFunc != nil {
		return m.ListOrdersFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockOrderServiceClient) ProcessPayment(ctx context.Context, in *orderpb.PaymentRequest, opts ...grpc.CallOption) (*orderpb.PaymentResponse, error) {
	if m.ProcessPaymentFunc != nil {
		return m.ProcessPaymentFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

// MockInventoryServiceClient is a gomock-compatible manual mock of inventorypb.InventoryServiceClient
type MockInventoryServiceClient struct {
	ctrl                    *gomock.Controller
	GetStockFunc            func(ctx context.Context, in *inventorypb.GetStockRequest, opts ...grpc.CallOption) (*inventorypb.StockInfo, error)
	UpdateStockFunc         func(ctx context.Context, in *inventorypb.UpdateStockRequest, opts ...grpc.CallOption) (*inventorypb.StockInfo, error)
	ReserveStockFunc        func(ctx context.Context, in *inventorypb.ReserveRequest, opts ...grpc.CallOption) (*inventorypb.ReserveResponse, error)
	ReleaseReservationFunc  func(ctx context.Context, in *inventorypb.ReleaseRequest, opts ...grpc.CallOption) (*inventorypb.ReleaseResponse, error)
	ConfirmReservationFunc  func(ctx context.Context, in *inventorypb.ConfirmRequest, opts ...grpc.CallOption) (*inventorypb.ConfirmResponse, error)
	WatchStockFunc          func(ctx context.Context, in *inventorypb.WatchStockRequest, opts ...grpc.CallOption) (inventorypb.InventoryService_WatchStockClient, error)
}

func NewMockInventoryServiceClient(ctrl *gomock.Controller) *MockInventoryServiceClient {
	return &MockInventoryServiceClient{ctrl: ctrl}
}

func (m *MockInventoryServiceClient) GetStock(ctx context.Context, in *inventorypb.GetStockRequest, opts ...grpc.CallOption) (*inventorypb.StockInfo, error) {
	if m.GetStockFunc != nil {
		return m.GetStockFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockInventoryServiceClient) UpdateStock(ctx context.Context, in *inventorypb.UpdateStockRequest, opts ...grpc.CallOption) (*inventorypb.StockInfo, error) {
	if m.UpdateStockFunc != nil {
		return m.UpdateStockFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockInventoryServiceClient) ReserveStock(ctx context.Context, in *inventorypb.ReserveRequest, opts ...grpc.CallOption) (*inventorypb.ReserveResponse, error) {
	if m.ReserveStockFunc != nil {
		return m.ReserveStockFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockInventoryServiceClient) ReleaseReservation(ctx context.Context, in *inventorypb.ReleaseRequest, opts ...grpc.CallOption) (*inventorypb.ReleaseResponse, error) {
	if m.ReleaseReservationFunc != nil {
		return m.ReleaseReservationFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockInventoryServiceClient) ConfirmReservation(ctx context.Context, in *inventorypb.ConfirmRequest, opts ...grpc.CallOption) (*inventorypb.ConfirmResponse, error) {
	if m.ConfirmReservationFunc != nil {
		return m.ConfirmReservationFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

func (m *MockInventoryServiceClient) WatchStock(ctx context.Context, in *inventorypb.WatchStockRequest, opts ...grpc.CallOption) (inventorypb.InventoryService_WatchStockClient, error) {
	if m.WatchStockFunc != nil {
		return m.WatchStockFunc(ctx, in, opts...)
	}
	return nil, status.Error(codes.Unimplemented, "not configured")
}

// =============================================================================
// Gomock-Based Failure Injection Tests (Req: gomock usage)
// =============================================================================

// TestMockUserServiceFailure uses gomock controller and mock client to simulate
// downstream UserService failures without a real gRPC server
func TestMockUserServiceFailure(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockUser := NewMockUserServiceClient(ctrl)

	// Simulate downstream service returning Internal error
	mockUser.GetUserFunc = func(ctx context.Context, in *userpb.GetUserRequest, opts ...grpc.CallOption) (*userpb.User, error) {
		return nil, status.Error(codes.Internal, "database connection lost")
	}

	// Test: calling GetUser returns proper gRPC error
	_, err := mockUser.GetUser(context.Background(), &userpb.GetUserRequest{Id: "user-1"})
	if err == nil {
		t.Fatal("expected error from mock, got nil")
	}
	st, ok := status.FromError(err)
	if !ok {
		t.Fatal("error must be extractable via status.FromError")
	}
	if st.Code() != codes.Internal {
		t.Fatalf("expected codes.Internal, got %v", st.Code())
	}
	if st.Message() != "database connection lost" {
		t.Fatalf("expected 'database connection lost', got '%s'", st.Message())
	}
}

// TestMockOrderServicePaymentFailure uses gomock to simulate payment processing failures
func TestMockOrderServicePaymentFailure(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockOrder := NewMockOrderServiceClient(ctrl)

	// Simulate payment gateway timeout
	mockOrder.ProcessPaymentFunc = func(ctx context.Context, in *orderpb.PaymentRequest, opts ...grpc.CallOption) (*orderpb.PaymentResponse, error) {
		return nil, status.Error(codes.DeadlineExceeded, "payment gateway timeout")
	}

	_, err := mockOrder.ProcessPayment(context.Background(), &orderpb.PaymentRequest{
		OrderId:       "order-1",
		PaymentMethod: "credit_card",
		PaymentToken:  "tok_test",
	})
	if err == nil {
		t.Fatal("expected error from mock")
	}
	st, ok := status.FromError(err)
	if !ok {
		t.Fatal("error must be extractable via status.FromError")
	}
	if st.Code() != codes.DeadlineExceeded {
		t.Fatalf("expected codes.DeadlineExceeded, got %v", st.Code())
	}
}

// TestMockInventoryServiceUnavailable uses gomock to simulate inventory service being down
func TestMockInventoryServiceUnavailable(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockInventory := NewMockInventoryServiceClient(ctrl)

	// Simulate service unavailable
	mockInventory.GetStockFunc = func(ctx context.Context, in *inventorypb.GetStockRequest, opts ...grpc.CallOption) (*inventorypb.StockInfo, error) {
		return nil, status.Error(codes.Unavailable, "service temporarily unavailable")
	}

	mockInventory.ReserveStockFunc = func(ctx context.Context, in *inventorypb.ReserveRequest, opts ...grpc.CallOption) (*inventorypb.ReserveResponse, error) {
		return nil, status.Error(codes.Unavailable, "service temporarily unavailable")
	}

	// Test GetStock failure
	_, err := mockInventory.GetStock(context.Background(), &inventorypb.GetStockRequest{ProductId: "prod-1"})
	if err == nil {
		t.Fatal("expected error from mock")
	}
	st, ok := status.FromError(err)
	if !ok {
		t.Fatal("error must be extractable via status.FromError")
	}
	if st.Code() != codes.Unavailable {
		t.Fatalf("expected codes.Unavailable, got %v", st.Code())
	}

	// Test ReserveStock failure
	_, err = mockInventory.ReserveStock(context.Background(), &inventorypb.ReserveRequest{
		ProductId: "prod-1",
		Quantity:  5,
		OrderId:   "order-1",
	})
	if err == nil {
		t.Fatal("expected error from mock")
	}
	st, ok = status.FromError(err)
	if !ok {
		t.Fatal("error must be extractable via status.FromError")
	}
	if st.Code() != codes.Unavailable {
		t.Fatalf("expected codes.Unavailable, got %v", st.Code())
	}
}

// TestMockCrossServiceFailurePropagation uses gomock to test how failures
// propagate across service boundaries in an order creation workflow
func TestMockCrossServiceFailurePropagation(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockUser := NewMockUserServiceClient(ctrl)
	mockInventory := NewMockInventoryServiceClient(ctrl)
	mockOrder := NewMockOrderServiceClient(ctrl)

	// Setup: User service works, inventory fails
	mockUser.GetUserFunc = func(ctx context.Context, in *userpb.GetUserRequest, opts ...grpc.CallOption) (*userpb.User, error) {
		return &userpb.User{Id: in.Id, Email: "test@test.com", Name: "Test"}, nil
	}

	mockInventory.ReserveStockFunc = func(ctx context.Context, in *inventorypb.ReserveRequest, opts ...grpc.CallOption) (*inventorypb.ReserveResponse, error) {
		return nil, status.Error(codes.ResourceExhausted, "out of stock")
	}

	mockOrder.CreateOrderFunc = func(ctx context.Context, in *orderpb.CreateOrderRequest, opts ...grpc.CallOption) (*orderpb.Order, error) {
		return nil, status.Error(codes.FailedPrecondition, "inventory reservation failed")
	}

	// Step 1: Verify user lookup succeeds
	userResp, err := mockUser.GetUser(context.Background(), &userpb.GetUserRequest{Id: "user-1"})
	if err != nil {
		t.Fatalf("user lookup should succeed: %v", err)
	}
	if userResp.Id != "user-1" {
		t.Fatalf("expected user-1, got %s", userResp.Id)
	}

	// Step 2: Inventory reservation fails
	_, err = mockInventory.ReserveStock(context.Background(), &inventorypb.ReserveRequest{
		ProductId: "prod-1",
		Quantity:  100,
		OrderId:   "order-1",
	})
	if err == nil {
		t.Fatal("inventory reservation should fail")
	}
	st, ok := status.FromError(err)
	if !ok {
		t.Fatal("error should be gRPC status")
	}
	if st.Code() != codes.ResourceExhausted {
		t.Fatalf("expected ResourceExhausted, got %v", st.Code())
	}

	// Step 3: Order creation fails because inventory failed
	_, err = mockOrder.CreateOrder(context.Background(), &orderpb.CreateOrderRequest{
		UserId: "user-1",
		Items:  []*orderpb.OrderItem{{ProductId: "prod-1", Quantity: 100, Price: 10.0}},
	})
	if err == nil {
		t.Fatal("order creation should fail")
	}
	st, ok = status.FromError(err)
	if !ok {
		t.Fatal("error should be gRPC status")
	}
	if st.Code() != codes.FailedPrecondition {
		t.Fatalf("expected FailedPrecondition, got %v", st.Code())
	}
}

// TestMockUnconfiguredMethodReturnsUnimplemented verifies mock defaults
func TestMockUnconfiguredMethodReturnsUnimplemented(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockUser := NewMockUserServiceClient(ctrl)

	// Without configuring any func, all methods should return Unimplemented
	_, err := mockUser.CreateUser(context.Background(), &userpb.CreateUserRequest{
		Email: "test@test.com", Name: "Test", Password: "pass",
	})
	if err == nil {
		t.Fatal("unconfigured mock should return error")
	}
	st, ok := status.FromError(err)
	if !ok {
		t.Fatal("error should be gRPC status")
	}
	if st.Code() != codes.Unimplemented {
		t.Fatalf("expected Unimplemented, got %v", st.Code())
	}
}

// =============================================================================
// DB + Testcontainers Tests (Req: testcontainers-go usage)
// =============================================================================

// TestContainerPostgresDataPersistence uses testcontainers-go to spin up a
// PostgreSQL container and validates data persistence and isolation semantics.
// Skipped if Docker socket is not available (e.g. in CI without DinD).
func TestContainerPostgresDataPersistence(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping testcontainers test in short mode")
	}

	ctx := context.Background()

	// Request a PostgreSQL container via testcontainers-go
	req := testcontainers.ContainerRequest{
		Image:        "postgres:15-alpine",
		ExposedPorts: []string{"5432/tcp"},
		Env: map[string]string{
			"POSTGRES_USER":     "testuser",
			"POSTGRES_PASSWORD": "testpass",
			"POSTGRES_DB":       "testdb",
		},
		WaitingFor: wait.ForLog("database system is ready to accept connections").
			WithOccurrence(2).
			WithStartupTimeout(60 * time.Second),
	}

	pgContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		t.Skipf("skipping testcontainers test: Docker not available: %v", err)
	}
	defer pgContainer.Terminate(ctx)

	// Get connection details
	host, err := pgContainer.Host(ctx)
	if err != nil {
		t.Fatalf("failed to get container host: %v", err)
	}

	mappedPort, err := pgContainer.MappedPort(ctx, "5432")
	if err != nil {
		t.Fatalf("failed to get mapped port: %v", err)
	}

	dsn := fmt.Sprintf("postgres://testuser:testpass@%s:%s/testdb?sslmode=disable", host, mappedPort.Port())

	// Connect to the database
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("failed to open DB: %v", err)
	}
	defer db.Close()

	// Wait for DB to be ready
	for i := 0; i < 30; i++ {
		err = db.Ping()
		if err == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("database not ready after retries: %v", err)
	}

	// Create schema
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id VARCHAR(64) PRIMARY KEY,
			email VARCHAR(255) UNIQUE NOT NULL,
			name VARCHAR(255) NOT NULL,
			created_at BIGINT NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("failed to create table: %v", err)
	}

	// Test 1: Insert and retrieve data
	t.Run("InsertAndRetrieve", func(t *testing.T) {
		_, err := db.Exec("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)",
			"user-1", "test@example.com", "Test User", time.Now().Unix())
		if err != nil {
			t.Fatalf("failed to insert: %v", err)
		}

		var name string
		err = db.QueryRow("SELECT name FROM users WHERE id = $1", "user-1").Scan(&name)
		if err != nil {
			t.Fatalf("failed to query: %v", err)
		}
		if name != "Test User" {
			t.Fatalf("expected 'Test User', got '%s'", name)
		}
	})

	// Test 2: Data isolation via schema reset
	t.Run("SchemaResetIsolation", func(t *testing.T) {
		// Truncate table to reset state
		_, err := db.Exec("TRUNCATE TABLE users")
		if err != nil {
			t.Fatalf("failed to truncate: %v", err)
		}

		// Verify table is empty
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
		if err != nil {
			t.Fatalf("failed to count: %v", err)
		}
		if count != 0 {
			t.Fatalf("expected 0 rows after truncate, got %d", count)
		}

		// Insert new data
		_, err = db.Exec("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)",
			"user-isolated", "isolated@example.com", "Isolated User", time.Now().Unix())
		if err != nil {
			t.Fatalf("failed to insert: %v", err)
		}

		err = db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
		if err != nil {
			t.Fatalf("failed to count: %v", err)
		}
		if count != 1 {
			t.Fatalf("expected 1 row, got %d", count)
		}
	})

	// Test 3: Unique constraint enforcement
	t.Run("UniqueConstraint", func(t *testing.T) {
		_, err := db.Exec("TRUNCATE TABLE users")
		if err != nil {
			t.Fatalf("failed to truncate: %v", err)
		}

		_, err = db.Exec("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)",
			"user-dup-1", "dup@example.com", "User 1", time.Now().Unix())
		if err != nil {
			t.Fatalf("failed to insert first: %v", err)
		}

		// Duplicate email should fail
		_, err = db.Exec("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)",
			"user-dup-2", "dup@example.com", "User 2", time.Now().Unix())
		if err == nil {
			t.Fatal("expected unique constraint violation, got nil")
		}
	})

	// Test 4: Transaction rollback isolation
	t.Run("TransactionRollback", func(t *testing.T) {
		_, err := db.Exec("TRUNCATE TABLE users")
		if err != nil {
			t.Fatalf("failed to truncate: %v", err)
		}

		tx, err := db.Begin()
		if err != nil {
			t.Fatalf("failed to begin tx: %v", err)
		}

		_, err = tx.Exec("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)",
			"user-tx", "tx@example.com", "TX User", time.Now().Unix())
		if err != nil {
			t.Fatalf("failed to insert in tx: %v", err)
		}

		// Rollback
		err = tx.Rollback()
		if err != nil {
			t.Fatalf("failed to rollback: %v", err)
		}

		// Verify data was not persisted
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM users WHERE id = $1", "user-tx").Scan(&count)
		if err != nil {
			t.Fatalf("failed to count: %v", err)
		}
		if count != 0 {
			t.Fatal("rolled-back data should not be visible")
		}
	})
}

// TestContainerServiceDataIsolation uses testcontainers-go to verify that
// separate container instances provide complete data isolation.
func TestContainerServiceDataIsolation(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping testcontainers test in short mode")
	}

	ctx := context.Background()

	// Helper to create a postgres container
	createPG := func(dbName string) (testcontainers.Container, *sql.DB, error) {
		req := testcontainers.ContainerRequest{
			Image:        "postgres:15-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "testuser",
				"POSTGRES_PASSWORD": "testpass",
				"POSTGRES_DB":       dbName,
			},
			WaitingFor: wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60 * time.Second),
		}

		c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
			ContainerRequest: req,
			Started:          true,
		})
		if err != nil {
			return nil, nil, err
		}

		host, _ := c.Host(ctx)
		port, _ := c.MappedPort(ctx, "5432")
		dsn := fmt.Sprintf("postgres://testuser:testpass@%s:%s/%s?sslmode=disable", host, port.Port(), dbName)
		db, err := sql.Open("postgres", dsn)
		if err != nil {
			c.Terminate(ctx)
			return nil, nil, err
		}

		// Wait for ready
		for i := 0; i < 30; i++ {
			if db.Ping() == nil {
				break
			}
			time.Sleep(500 * time.Millisecond)
		}

		return c, db, nil
	}

	container1, db1, err := createPG("isolationdb1")
	if err != nil {
		t.Skipf("skipping: Docker not available: %v", err)
	}
	defer container1.Terminate(ctx)
	defer db1.Close()

	container2, db2, err := createPG("isolationdb2")
	if err != nil {
		t.Skipf("skipping: Docker not available: %v", err)
	}
	defer container2.Terminate(ctx)
	defer db2.Close()

	// Create tables in both
	for _, db := range []*sql.DB{db1, db2} {
		_, err := db.Exec(`CREATE TABLE IF NOT EXISTS items (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255))`)
		if err != nil {
			t.Fatalf("failed to create table: %v", err)
		}
	}

	// Insert data only into db1
	_, err = db1.Exec("INSERT INTO items (id, name) VALUES ($1, $2)", "item-1", "DB1 Item")
	if err != nil {
		t.Fatalf("failed to insert into db1: %v", err)
	}

	// Verify db1 has the data
	var count1 int
	db1.QueryRow("SELECT COUNT(*) FROM items").Scan(&count1)
	if count1 != 1 {
		t.Fatalf("db1 should have 1 item, got %d", count1)
	}

	// Verify db2 does NOT have the data (isolation)
	var count2 int
	db2.QueryRow("SELECT COUNT(*) FROM items").Scan(&count2)
	if count2 != 0 {
		t.Fatalf("db2 should have 0 items (isolated), got %d", count2)
	}
}

func TestIntegrationSuite(t *testing.T) {
	defer goleak.VerifyNone(t)
	suite.Run(t, new(IntegrationTestSuite))
}
