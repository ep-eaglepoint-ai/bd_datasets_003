package user

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	pb "github.com/example/microservices/proto/user"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Service struct {
	pb.UnimplementedUserServiceServer
	mu       sync.RWMutex
	users    map[string]*userData
	emails   map[string]string
	tokens   map[string]string
}

type userData struct {
	user     *pb.User
	password string
}

func NewService() *Service {
	return &Service{
		users:  make(map[string]*userData),
		emails: make(map[string]string),
		tokens: make(map[string]string),
	}
}

func (s *Service) CreateUser(ctx context.Context, req *pb.CreateUserRequest) (*pb.User, error) {
	if req.Email == "" {
		return nil, status.Error(codes.InvalidArgument, "email is required")
	}
	if req.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}
	if req.Password == "" {
		return nil, status.Error(codes.InvalidArgument, "password is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.emails[req.Email]; exists {
		return nil, status.Error(codes.AlreadyExists, "email already exists")
	}

	id := generateID()
	now := time.Now().Unix()

	user := &pb.User{
		Id:        id,
		Email:     req.Email,
		Name:      req.Name,
		Role:      req.Role,
		CreatedAt: now,
		UpdatedAt: now,
	}

	s.users[id] = &userData{user: user, password: req.Password}
	s.emails[req.Email] = id

	return user, nil
}

func (s *Service) GetUser(ctx context.Context, req *pb.GetUserRequest) (*pb.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, exists := s.users[req.Id]
	if !exists {
		return nil, status.Error(codes.NotFound, "user not found")
	}

	return data.user, nil
}

func (s *Service) UpdateUser(ctx context.Context, req *pb.UpdateUserRequest) (*pb.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, exists := s.users[req.Id]
	if !exists {
		return nil, status.Error(codes.NotFound, "user not found")
	}

	if req.Email != "" && req.Email != data.user.Email {
		if _, emailExists := s.emails[req.Email]; emailExists {
			return nil, status.Error(codes.AlreadyExists, "email already exists")
		}
		delete(s.emails, data.user.Email)
		s.emails[req.Email] = req.Id
		data.user.Email = req.Email
	}

	if req.Name != "" {
		data.user.Name = req.Name
	}
	if req.Role != "" {
		data.user.Role = req.Role
	}

	data.user.UpdatedAt = time.Now().Unix()

	return data.user, nil
}

func (s *Service) DeleteUser(ctx context.Context, req *pb.DeleteUserRequest) (*pb.DeleteUserResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, exists := s.users[req.Id]
	if !exists {
		return nil, status.Error(codes.NotFound, "user not found")
	}

	delete(s.emails, data.user.Email)
	delete(s.users, req.Id)

	return &pb.DeleteUserResponse{Success: true}, nil
}

func (s *Service) ListUsers(req *pb.ListUsersRequest, stream pb.UserService_ListUsersServer) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, data := range s.users {
		if err := stream.Context().Err(); err != nil {
			return status.Error(codes.Canceled, "stream cancelled")
		}
		if err := stream.Send(data.user); err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) Authenticate(ctx context.Context, req *pb.AuthRequest) (*pb.AuthResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	userID, exists := s.emails[req.Email]
	if !exists {
		return nil, status.Error(codes.Unauthenticated, "invalid credentials")
	}

	data := s.users[userID]
	if data.password != req.Password {
		return nil, status.Error(codes.Unauthenticated, "invalid credentials")
	}

	token := generateToken()
	s.tokens[token] = userID

	return &pb.AuthResponse{
		Token:     token,
		User:      data.user,
		ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
	}, nil
}

func (s *Service) ValidateToken(token string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	userID, exists := s.tokens[token]
	return userID, exists
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}
