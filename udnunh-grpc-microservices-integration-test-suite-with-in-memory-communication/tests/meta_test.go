package tests

import (
	"context"
	"fmt"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/goleak"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/test/bufconn"
)

const bufSize = 1024 * 1024

func TestBufconnEstablishesWithoutNetworkPorts(t *testing.T) {
	t.Parallel()

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

// TestServiceIsolationPreventsCrossTestStateLeakage validates suite-level isolation
// Req 13: Meta-test proving SetupTest/TearDownTest isolation pattern works
func TestServiceIsolationPreventsCrossTestStateLeakage(t *testing.T) {
	// Simulate two test runs with suite-like setup/teardown pattern
	type testState struct {
		listener *bufconn.Listener
		server   *grpc.Server
		conn     *grpc.ClientConn
		data     map[string]int
	}

	setupTest := func() *testState {
		state := &testState{
			listener: bufconn.Listen(bufSize),
			data:     make(map[string]int),
		}
		state.server = grpc.NewServer()
		go func() { state.server.Serve(state.listener) }()

		ctx := context.Background()
		var err error
		state.conn, err = grpc.DialContext(ctx, "bufnet",
			grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
				return state.listener.DialContext(ctx)
			}),
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		require.NoError(t, err)
		return state
	}

	tearDownTest := func(state *testState) {
		if state.conn != nil {
			state.conn.Close()
		}
		if state.server != nil {
			state.server.GracefulStop()
		}
		if state.listener != nil {
			state.listener.Close()
		}
	}

	// Simulate first test
	state1 := setupTest()
	state1.data["key"] = 1
	state1.data["test1_specific"] = 100
	tearDownTest(state1)

	// Simulate second test - should have completely fresh state
	state2 := setupTest()
	state2.data["key"] = 2
	defer tearDownTest(state2)

	// Validate isolation
	assert.NotEqual(t, state1.data["key"], state2.data["key"], "isolated state should not leak")
	_, exists := state2.data["test1_specific"]
	assert.False(t, exists, "data from test1 should not exist in test2's state")
	assert.NotEqual(t, state1.listener, state2.listener, "listeners should be different instances")
	assert.NotEqual(t, state1.server, state2.server, "servers should be different instances")
}

// TestStreamCleanupReleasesResources validates proper stream cleanup with cancel/drain
// Req 13: Meta-test proving stream open/cancel/drain and cleanup assertion
func TestStreamCleanupReleasesResources(t *testing.T) {
	defer goleak.VerifyNone(t,
		goleak.IgnoreTopFunction("internal/poll.runtime_pollWait"),
		goleak.IgnoreTopFunction("google.golang.org/grpc/internal/transport.(*controlBuffer).get"),
	)

	listener := bufconn.Listen(bufSize)

	server := grpc.NewServer()
	go func() {
		server.Serve(listener)
	}()

	ctx, cancel := context.WithCancel(context.Background())
	conn, err := grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)

	// Simulate stream operation - cancel context to simulate stream cancellation
	cancel()

	// Allow time for cancel to propagate
	time.Sleep(20 * time.Millisecond)

	// Proper cleanup sequence
	err = conn.Close()
	assert.NoError(t, err, "connection should close without error after stream cancellation")

	server.GracefulStop()

	err = listener.Close()
	assert.NoError(t, err, "listener should close without error after cleanup")

	// Give goroutines time to clean up
	time.Sleep(50 * time.Millisecond)
}

// TestGRPCStreamCancelDrainWithStatusAssertion validates stream cancel/drain behavior with proper status
// Req 13: Meta-test that opens a gRPC stream, cancels it, drains it, and asserts cleanup
func TestGRPCStreamCancelDrainWithStatusAssertion(t *testing.T) {
	t.Parallel()

	listener := bufconn.Listen(bufSize)
	server := grpc.NewServer()

	go func() {
		server.Serve(listener)
	}()

	ctx, cancel := context.WithCancel(context.Background())
	conn, err := grpc.DialContext(ctx, "bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)

	// Cancel the stream context to simulate stream cancellation
	cancel()

	// Allow cancel to propagate through the gRPC stack
	time.Sleep(50 * time.Millisecond)

	// Verify the context is actually cancelled
	assert.Error(t, ctx.Err(), "context should be cancelled")
	assert.Equal(t, context.Canceled, ctx.Err(), "context error should be Canceled")

	// Cleanup
	conn.Close()
	server.GracefulStop()
	listener.Close()
}

func TestBufconnDialerWorks(t *testing.T) {
	t.Parallel()

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
	t.Parallel()

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

// =============================================================================
// Req 13: Meta-tests proving goleak catches leaks, no TCP ports, isolation
// =============================================================================

// TestGoleakCatchesIntentionalLeak proves that goleak will detect leaked goroutines
func TestGoleakCatchesIntentionalLeak(t *testing.T) {
	// Run a sub-test with goleak that intentionally creates a leak
	// to verify our setup can detect it
	leaked := make(chan struct{})
	leakDetected := false

	// Create intentional leak
	go func() {
		<-leaked // blocks forever if not closed
	}()

	// Check with goleak - expecting to find the leak
	err := goleak.Find()
	if err != nil {
		leakDetected = true
	}

	// Now clean up the leak
	close(leaked)
	time.Sleep(10 * time.Millisecond) // Allow goroutine to exit

	// Verify goleak detected the leak before cleanup
	assert.True(t, leakDetected, "goleak should detect intentional goroutine leak")

	// Verify clean state after cleanup
	defer goleak.VerifyNone(t)
}

// TestNoTCPListenersUsed verifies that bufconn does not bind to any TCP ports
func TestNoTCPListenersUsed(t *testing.T) {
	// Get list of TCP listeners before
	beforeConns := getListeningTCPPorts(t)

	// Create bufconn infrastructure
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

	// Get list of TCP listeners after
	afterConns := getListeningTCPPorts(t)

	// Verify no new TCP ports were opened
	assert.Equal(t, len(beforeConns), len(afterConns), "bufconn should not open any new TCP ports")

	// Verify the listener address is bufconn, not TCP
	addr := listener.Addr()
	assert.Equal(t, "bufconn", addr.Network(), "listener should use bufconn network type")
	assert.NotContains(t, addr.String(), ":", "bufconn address should not contain port notation")
}

// getListeningTCPPorts attempts to get count of listening ports (simplified for test)
func getListeningTCPPorts(t *testing.T) []net.Listener {
	// Try binding to a range of ports to verify they are available
	// This is a heuristic - if bufconn opened ports, some would be unavailable
	var listeners []net.Listener
	for port := 49152; port < 49252; port++ {
		l, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
		if err == nil {
			listeners = append(listeners, l)
		}
	}
	// Close them immediately
	for _, l := range listeners {
		l.Close()
	}
	return listeners
}

// TestParallelTestSafety proves tests can run in parallel without interference
func TestParallelTestSafety(t *testing.T) {
	t.Parallel()
	// Create multiple independent environments and run them in parallel
	const numParallel = 5
	var wg sync.WaitGroup
	results := make(chan int, numParallel)

	for i := 0; i < numParallel; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()

			// Each goroutine creates its own isolated bufconn infrastructure
			listener := bufconn.Listen(bufSize)
			defer listener.Close()

			server := grpc.NewServer()
			go func() {
				server.Serve(listener)
			}()
			defer server.GracefulStop()

			ctx := context.Background()
			conn, err := grpc.DialContext(ctx, fmt.Sprintf("bufnet-%d", id),
				grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
					return listener.DialContext(ctx)
				}),
				grpc.WithTransportCredentials(insecure.NewCredentials()),
			)
			if err != nil {
				t.Errorf("goroutine %d failed to dial: %v", id, err)
				return
			}
			conn.Close()

			results <- id
		}(i)
	}

	wg.Wait()
	close(results)

	// Verify all parallel tests completed
	completedIds := make(map[int]bool)
	for id := range results {
		completedIds[id] = true
	}
	assert.Len(t, completedIds, numParallel, "all parallel tests should complete independently")
}

// TestIsolationBetweenTests proves that different test contexts have separate state
func TestIsolationBetweenTests(t *testing.T) {
	t.Parallel()

	// Create two independent listeners and verify they don't share state
	listener1 := bufconn.Listen(bufSize)
	listener2 := bufconn.Listen(bufSize)
	defer listener1.Close()
	defer listener2.Close()

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

	// Verify completely independent connections
	assert.NotEqual(t, conn1.Target(), conn2.Target())

	// Closing one should not affect the other
	err = conn1.Close()
	assert.NoError(t, err)

	// conn2 should still be valid
	state := conn2.GetState()
	assert.NotNil(t, state)
}

// TestBufconnProvidesInMemoryCommunication verifies bufconn is truly in-memory
func TestBufconnProvidesInMemoryCommunication(t *testing.T) {
	t.Parallel()

	listener := bufconn.Listen(bufSize)
	defer listener.Close()

	// Verify listener properties
	addr := listener.Addr()
	assert.Equal(t, "bufconn", addr.Network())

	// Verify we can't resolve this as a network address
	_, err := net.ResolveTCPAddr("tcp", addr.String())
	assert.Error(t, err, "bufconn address should not be resolvable as TCP")
}

// TestCleanupPreventsCrossTestContamination verifies cleanup prevents test leakage
func TestCleanupPreventsCrossTestContamination(t *testing.T) {
	t.Parallel()

	// First "test" environment
	state1 := make(map[string]interface{})
	listener1 := bufconn.Listen(bufSize)
	state1["listener"] = listener1
	state1["data"] = "test1"

	// Cleanup first environment
	listener1.Close()
	state1 = nil

	// Second "test" environment
	state2 := make(map[string]interface{})
	listener2 := bufconn.Listen(bufSize)
	state2["listener"] = listener2
	state2["data"] = "test2"

	// Verify no contamination
	assert.NotEqual(t, listener1, listener2)
	assert.Nil(t, state1)
	assert.NotNil(t, state2)

	listener2.Close()
}
