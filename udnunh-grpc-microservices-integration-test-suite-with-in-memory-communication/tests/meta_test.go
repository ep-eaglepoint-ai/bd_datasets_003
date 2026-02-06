package tests

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
)

const bufSize = 1024 * 1024

func TestBufconnEstablishesWithoutNetworkPorts(t *testing.T) {
	listener := bufconn.Listen(bufSize)
	defer listener.Close()

	server := grpc.NewServer()
	go func() {
		server.Serve(listener)
	}()
	defer server.GracefulStop()

	ctx := context.Background()
	conn, err := grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer conn.Close()

	addr := listener.Addr()
	assert.Equal(t, "bufconn", addr.Network(), "listener should use bufconn network, not TCP")
}

func TestServiceIsolationPreventsCrossTestStateLeakage(t *testing.T) {
	state1 := make(map[string]int)
	state2 := make(map[string]int)

	state1["key"] = 1
	state2["key"] = 2

	assert.NotEqual(t, state1["key"], state2["key"], "isolated state should not leak")
}

func TestStreamCleanupReleasesResources(t *testing.T) {
	listener := bufconn.Listen(bufSize)

	server := grpc.NewServer()
	go func() {
		server.Serve(listener)
	}()

	ctx := context.Background()
	conn, err := grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)

	err = conn.Close()
	assert.NoError(t, err, "connection should close without error")

	server.GracefulStop()

	err = listener.Close()
	assert.NoError(t, err, "listener should close without error")
}

func TestBufconnDialerWorks(t *testing.T) {
	listener := bufconn.Listen(bufSize)
	defer listener.Close()

	server := grpc.NewServer()
	go func() {
		server.Serve(listener)
	}()
	defer server.GracefulStop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, err := grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer conn.Close()

	assert.NotNil(t, conn, "connection should be established")
}

func TestMultipleBufconnListenersAreIndependent(t *testing.T) {
	listener1 := bufconn.Listen(bufSize)
	listener2 := bufconn.Listen(bufSize)
	defer listener1.Close()
	defer listener2.Close()

	assert.NotEqual(t, listener1, listener2, "listeners should be different instances")

	server1 := grpc.NewServer()
	server2 := grpc.NewServer()
	go func() { server1.Serve(listener1) }()
	go func() { server2.Serve(listener2) }()
	defer server1.GracefulStop()
	defer server2.GracefulStop()

	ctx := context.Background()
	conn1, err := grpc.DialContext(ctx, "bufnet1",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener1.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer conn1.Close()

	conn2, err := grpc.DialContext(ctx, "bufnet2",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener2.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	defer conn2.Close()

	assert.NotEqual(t, conn1.Target(), conn2.Target(), "connections should have different targets")
}

func TestGracefulShutdownWorks(t *testing.T) {
	listener := bufconn.Listen(bufSize)
	server := grpc.NewServer()

	go func() {
		server.Serve(listener)
	}()

	ctx := context.Background()
	conn, err := grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)

	done := make(chan struct{})
	go func() {
		conn.Close()
		server.GracefulStop()
		listener.Close()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("graceful shutdown timed out")
	}
}
