# Trajectory: WebSocket Virtual Waiting Room with Heartbeat Eviction

## Problem Analysis

Build a stateful WebSocket system with strict concurrency control (max 5 active sessions), FIFO queue management, and heartbeat-based liveness detection (3-second timeout). Core challenge: ensure atomicity during disconnect-promote sequences to prevent race conditions.

## Design Strategy

### Component-Based Architecture

- **StateManager**: Single source of truth (Active Pool Map + FIFO Queue Array)
- **QueueManager**: FIFO operations and position tracking
- **HeartbeatMonitor**: Independent 3-second timeout timers per session
- **PromotionManager**: Atomic queue-to-active transitions
- **ConnectionManager**: Orchestrates all components
- **MessageHandler**: Protocol serialization/deserialization

### Key Design Decisions

1. **Synchronous State Mutations**: All state changes are synchronous to leverage JavaScript's single-threaded event loop for atomicity
2. **Data Structures**: Map for O(1) active pool operations, Array for FIFO queue
3. **Timer Management**: Centralized cleanup in `stopMonitoring()` called from all disconnect paths

## Implementation

### Server Components (server.js)

**StateManager**: Manages activePool Map (max 5), queue Array, and sessionRegistry Map. Enforces capacity limits and maintains FIFO ordering.

**HeartbeatMonitor**: Creates 3-second setTimeout per active session. Resets timer on ping/pong. Calls forceDisconnect on timeout.

**PromotionManager**: Checks WebSocket readyState before promotion. Atomically dequeues, adds to active pool, starts heartbeat, sends status message, updates queue positions.

**ConnectionManager**: Routes new connections to active pool or queue based on capacity. Handles cleanup and triggers promotion on active disconnect.

### Client (client.js)

Automatic ping every 2 seconds (safety margin within 3-second timeout). Tracks status (queued/active) and position. Handles status updates from server.

### Testing (tests/server.test.js)

Adversarial tests designed to break the system:
- Saturation: Verify strict 5-session limit
- Race conditions: Simultaneous disconnects
- Heartbeat eviction: Timeout enforcement
- Malformed messages: Invalid JSON handling
- Memory leaks: Rapid connect/disconnect cycles
- FIFO ordering: Multiple promotions

## Key Implementation Details

**Atomic Promotion Algorithm**:
```
1. Check capacity (sync)
2. Dequeue session (sync)
3. Add to active pool (sync)
4. Start heartbeat timer (sync)
5. Send message (async, doesn't affect state)
6. Update queue positions (sync)
```

**Timer Cleanup**: All disconnect paths (graceful, forced, timeout, error) call `stopMonitoring()` to clear timers and prevent memory leaks.

**Error Handling**: All event handlers wrapped in try-catch. Malformed messages logged but don't crash server.

## Resources

- ws library: https://github.com/websockets/ws
- Node.js timers: https://nodejs.org/api/timers.html
- Jest testing: https://jestjs.io/docs/getting-started
- UUID: https://github.com/uuidjs/uuid
