package inventory

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	pb "github.com/example/microservices/proto/inventory"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Service struct {
	pb.UnimplementedInventoryServiceServer
	mu           sync.RWMutex
	stock        map[string]*stockData
	reservations map[string]*reservation
	watchers     map[string][]chan *pb.StockUpdate
	watcherMu    sync.RWMutex
}

type stockData struct {
	productId string
	available int32
	reserved  int32
	updatedAt int64
}

type reservation struct {
	id        string
	productId string
	quantity  int32
	orderId   string
	expiresAt int64
}

func NewService() *Service {
	return &Service{
		stock:        make(map[string]*stockData),
		reservations: make(map[string]*reservation),
		watchers:     make(map[string][]chan *pb.StockUpdate),
	}
}

func (s *Service) GetStock(ctx context.Context, req *pb.GetStockRequest) (*pb.StockInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, exists := s.stock[req.ProductId]
	if !exists {
		return &pb.StockInfo{
			ProductId: req.ProductId,
			Available: 0,
			Reserved:  0,
			UpdatedAt: time.Now().Unix(),
		}, nil
	}

	return &pb.StockInfo{
		ProductId: data.productId,
		Available: data.available,
		Reserved:  data.reserved,
		UpdatedAt: data.updatedAt,
	}, nil
}

func (s *Service) UpdateStock(ctx context.Context, req *pb.UpdateStockRequest) (*pb.StockInfo, error) {
	s.mu.Lock()

	data, exists := s.stock[req.ProductId]
	if !exists {
		data = &stockData{
			productId: req.ProductId,
			available: 0,
			reserved:  0,
		}
		s.stock[req.ProductId] = data
	}

	newAvailable := data.available + req.QuantityChange
	if newAvailable < 0 {
		s.mu.Unlock()
		return nil, status.Error(codes.FailedPrecondition, "insufficient stock")
	}

	data.available = newAvailable
	data.updatedAt = time.Now().Unix()

	info := &pb.StockInfo{
		ProductId: data.productId,
		Available: data.available,
		Reserved:  data.reserved,
		UpdatedAt: data.updatedAt,
	}

	s.mu.Unlock()

	s.notifyWatchers(req.ProductId, &pb.StockUpdate{
		ProductId:  req.ProductId,
		Available:  data.available,
		Reserved:   data.reserved,
		ChangeType: "update",
		Timestamp:  data.updatedAt,
	})

	return info, nil
}

func (s *Service) ReserveStock(ctx context.Context, req *pb.ReserveRequest) (*pb.ReserveResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, exists := s.stock[req.ProductId]
	if !exists || data.available < req.Quantity {
		return &pb.ReserveResponse{
			Success:      false,
			ErrorMessage: "insufficient stock",
		}, nil
	}

	reservationId := generateID()
	res := &reservation{
		id:        reservationId,
		productId: req.ProductId,
		quantity:  req.Quantity,
		orderId:   req.OrderId,
		expiresAt: req.ExpiresAt,
	}

	data.available -= req.Quantity
	data.reserved += req.Quantity
	data.updatedAt = time.Now().Unix()

	s.reservations[reservationId] = res

	return &pb.ReserveResponse{
		Success:       true,
		ReservationId: reservationId,
	}, nil
}

func (s *Service) ReleaseReservation(ctx context.Context, req *pb.ReleaseRequest) (*pb.ReleaseResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, exists := s.reservations[req.ReservationId]
	if !exists {
		return nil, status.Error(codes.NotFound, "reservation not found")
	}

	data := s.stock[res.productId]
	data.available += res.quantity
	data.reserved -= res.quantity
	data.updatedAt = time.Now().Unix()

	delete(s.reservations, req.ReservationId)

	return &pb.ReleaseResponse{Success: true}, nil
}

func (s *Service) ConfirmReservation(ctx context.Context, req *pb.ConfirmRequest) (*pb.ConfirmResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, exists := s.reservations[req.ReservationId]
	if !exists {
		return nil, status.Error(codes.NotFound, "reservation not found")
	}

	data := s.stock[res.productId]
	data.reserved -= res.quantity
	data.updatedAt = time.Now().Unix()

	delete(s.reservations, req.ReservationId)

	return &pb.ConfirmResponse{Success: true}, nil
}

func (s *Service) WatchStock(req *pb.WatchStockRequest, stream pb.InventoryService_WatchStockServer) error {
	ch := make(chan *pb.StockUpdate, 100)

	s.watcherMu.Lock()
	for _, productId := range req.ProductIds {
		s.watchers[productId] = append(s.watchers[productId], ch)
	}
	s.watcherMu.Unlock()

	defer func() {
		s.watcherMu.Lock()
		for _, productId := range req.ProductIds {
			watchers := s.watchers[productId]
			for i, w := range watchers {
				if w == ch {
					s.watchers[productId] = append(watchers[:i], watchers[i+1:]...)
					break
				}
			}
		}
		s.watcherMu.Unlock()
		close(ch)
	}()

	for {
		select {
		case <-stream.Context().Done():
			return status.Error(codes.Canceled, "stream cancelled")
		case update, ok := <-ch:
			if !ok {
				return nil
			}
			if err := stream.Send(update); err != nil {
				return err
			}
		}
	}
}

func (s *Service) notifyWatchers(productId string, update *pb.StockUpdate) {
	s.watcherMu.RLock()
	defer s.watcherMu.RUnlock()

	for _, ch := range s.watchers[productId] {
		select {
		case ch <- update:
		default:
		}
	}
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
