# Implementation Trajectory: WebSocket Chat System Bug Fixes

This document outlines the changes implemented in `repository_after` to resolve memory leaks, race conditions, and performance issues found in the original WebSocket chat system.

## 1. Memory Leak & Resource Management
*   **Empty Room Cleanup:** Implemented logic in `hub.go` to delete room entries from the `h.rooms` map when the last client disconnects. This prevents unbounded memory growth.
*   **Redis Subscription Lifecycle:** Replaced global/per-client subscriptions with a **per-room subscription model**. Subscriptions are now explicitly closed via a `stop` channel and `defer pubsub.Close()` when a room becomes empty.
*   **Ticker Management:** Added `defer ticker.Stop()` in the client `writePump` to prevent timer leaks.
*   **Socket Closing:** Added explicit `c.conn.Close()` calls in both `readPump` and `writePump` to ensure TCP resources are released immediately upon failure or disconnection.

## 2. Concurrency & Thread Safety
*   **Safe Data Access:** Integrated `sync.RWMutex` into the `Hub` struct. All map accesses (clients, rooms, subscriptions) are now protected by either a Lock or RLock, eliminating race conditions.
*   **Atomic Shutdown Channel:** Added a `Quit` channel to the `Hub` to provide a clean signal for background goroutines to terminate.

## 3. Slow Client Handling & Backpressure
*   **Non-blocking Broadcast:** Changed the message distribution logic to use a non-blocking `select` when sending to client channels.
*   **Active Eviction:** If a client's `send` buffer is full (meaning they aren't consuming messages fast enough), the server now proactively closes their connection to prevent them from lagging the entire broadcast loop.
*   **Increased Buffering:** Added buffers to critical channels (`broadcast`, `unregister`, and per-client `send`) to absorb transient spikes in traffic.

## 4. Performance Optimizations
*   **Write Batching:** Implemented message batching in `client.go`. The `writePump` now checks if more messages are queued and concatenates them into a single WebSocket frame (newline-separated), significantly reducing the number of write syscalls.
*   **Subscription Consolidation:** By subscribing to Redis channels at the room level rather than the client level, we significantly reduced the number of active Redis connections and concurrent goroutines.

## 5. Network Reliability & Security
*   **I/O Deadlines:** Added `SetReadDeadline` and `SetWriteDeadline` to all WebSocket operations. This prevents "zombie" connections from staying open indefinitely if the network path is interrupted.
*   **Heartbeat Logic:** Implemented a proper `PongHandler` that extends the read deadline, ensuring clients are only disconnected if they truly stop responding.
*   **Payload Protection:** Enforced `maxMessageSize` to protect the server from memory exhaustion attacks via oversized JSON payloads.

## 6. Graceful Shutdown
*   **Signal Interception:** Updated `main.go` to listen for `SIGINT` and `SIGTERM`.
*   **Coordinated Exit:** On shutdown, the server now:
    1.  Signals the Hub to stop.
    2.  The Hub closes all client connections and cleans up Redis subscriptions.
    3.  The HTTP server uses `Shutdown(ctx)` to stop accepting new connections while finishing active ones.

## 7. Observability & Configuration
*   **Thread-Safe Metrics:** Modified the `/metrics` endpoint to use RLock, ensuring reported client and room counts are accurate even under high concurrency.
*   **Environment Config:** Added `REDIS_ADDR` environment variable support in `redis.go` for easier deployment in containerized environments.
