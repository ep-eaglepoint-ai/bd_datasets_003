package order

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	pb "github.com/example/microservices/proto/order"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Service struct {
	pb.UnimplementedOrderServiceServer
	mu     sync.RWMutex
	orders map[string]*pb.Order
}

var validTransitions = map[string][]string{
	"pending":   {"confirmed", "cancelled"},
	"confirmed": {"shipped", "cancelled"},
	"shipped":   {"delivered"},
	"delivered": {},
	"cancelled": {},
}

func NewService() *Service {
	return &Service{
		orders: make(map[string]*pb.Order),
	}
}

func (s *Service) CreateOrder(ctx context.Context, req *pb.CreateOrderRequest) (*pb.Order, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}
	if len(req.Items) == 0 {
		return nil, status.Error(codes.InvalidArgument, "at least one item is required")
	}

	var totalAmount float64
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			return nil, status.Error(codes.InvalidArgument, "quantity must be positive")
		}
		totalAmount += float64(item.Quantity) * item.Price
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	id := generateID()
	now := time.Now().Unix()

	order := &pb.Order{
		Id:              id,
		UserId:          req.UserId,
		Items:           req.Items,
		Status:          "pending",
		TotalAmount:     totalAmount,
		ShippingAddress: req.ShippingAddress,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	s.orders[id] = order

	return order, nil
}

func (s *Service) GetOrder(ctx context.Context, req *pb.GetOrderRequest) (*pb.Order, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	order, exists := s.orders[req.Id]
	if !exists {
		return nil, status.Error(codes.NotFound, "order not found")
	}

	return order, nil
}

func (s *Service) UpdateOrderStatus(ctx context.Context, req *pb.UpdateStatusRequest) (*pb.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	order, exists := s.orders[req.Id]
	if !exists {
		return nil, status.Error(codes.NotFound, "order not found")
	}

	allowed := validTransitions[order.Status]
	isValid := false
	for _, s := range allowed {
		if s == req.Status {
			isValid = true
			break
		}
	}

	if !isValid {
		return nil, status.Errorf(codes.FailedPrecondition, "cannot transition from %s to %s", order.Status, req.Status)
	}

	order.Status = req.Status
	order.UpdatedAt = time.Now().Unix()

	return order, nil
}

func (s *Service) CancelOrder(ctx context.Context, req *pb.CancelOrderRequest) (*pb.Order, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	order, exists := s.orders[req.Id]
	if !exists {
		return nil, status.Error(codes.NotFound, "order not found")
	}

	if order.Status == "shipped" || order.Status == "delivered" {
		return nil, status.Error(codes.FailedPrecondition, "cannot cancel shipped or delivered order")
	}

	if order.Status == "cancelled" {
		return nil, status.Error(codes.FailedPrecondition, "order already cancelled")
	}

	order.Status = "cancelled"
	order.UpdatedAt = time.Now().Unix()

	return order, nil
}

func (s *Service) ListOrders(req *pb.ListOrdersRequest, stream pb.OrderService_ListOrdersServer) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, order := range s.orders {
		if err := stream.Context().Err(); err != nil {
			return status.Error(codes.Canceled, "stream cancelled")
		}

		if req.UserId != "" && order.UserId != req.UserId {
			continue
		}
		if req.Status != "" && order.Status != req.Status {
			continue
		}

		if err := stream.Send(order); err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) ProcessPayment(ctx context.Context, req *pb.PaymentRequest) (*pb.PaymentResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	order, exists := s.orders[req.OrderId]
	if !exists {
		return nil, status.Error(codes.NotFound, "order not found")
	}

	if order.Status != "pending" {
		return &pb.PaymentResponse{
			Success:      false,
			ErrorMessage: "order not in pending status",
		}, nil
	}

	order.Status = "confirmed"
	order.UpdatedAt = time.Now().Unix()

	return &pb.PaymentResponse{
		Success:       true,
		TransactionId: generateID(),
	}, nil
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
