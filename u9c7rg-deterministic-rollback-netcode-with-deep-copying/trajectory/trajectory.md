# Problem-Solving Trajectory

1. Analyze the Rollback Netcode Problem (Identify Pointer Aliasing Trap):
   I analyzed the task requirements for a deterministic rollback netcode system. The core challenge is handling out-of-order inputs in multiplayer games where the server must "rewind time" when late inputs arrive. The critical memory trap is pointer aliasing — if GameState contains slice pointers, naive copying duplicates the slice header but shares the underlying array. When rollback logic modifies entity positions during re-simulation, it accidentally corrupts the saved history in the ring buffer, destroying timeline integrity. This requires strict deep copying or pure value semantics to prevent shared mutable state.
   Understanding pointer aliasing and shallow vs deep copy: https://en.wikipedia.org/wiki/Aliasing_(computing)

2. Define Determinism and Memory Safety Requirements:
   I established strict requirements: rollback must be deterministic (same inputs produce identical outputs), state restoration must use deep copies to prevent mutation of historical snapshots, physics must use Euler integration for predictable stepping, collision response must be elastic and reproducible, and the ring buffer must maintain 60 seconds of history at 60 FPS (3600 frames) without memory leaks or corruption.

3. Implement Value-Based Entity Structure (Avoid Pointer Semantics):
   I designed the Entity struct using pure value types (int and float64) rather than pointers. This ensures that when copying entities, Go's default behavior creates independent copies. Each entity stores id, position (x, y), velocity (velocity_x, velocity_y), and health as stack-allocated values. This eliminates one major source of pointer aliasing at the entity level.

4. Build Ring Buffer with Fixed-Size Array (O(1) Access):
   I implemented the ring buffer using a fixed-size array [BufferSize]GameState rather than a dynamically growing slice. This provides O(1) access time using modulo indexing (frame % BufferSize) and eliminates reallocation overhead. The buffer stores 3600 frames, overwriting old frames as new ones arrive. This pattern is common in real-time systems where fixed memory bounds prevent heap fragmentation.
   Ring buffer data structure explained: https://en.wikipedia.org/wiki/Circular_buffer

5. Implement Explicit Deep Copy for GameState:
   I created a deepCopy() method that allocates a new Entity slice and explicitly copies each entity value. The critical operation is `copied.Entities = make([]Entity, len(state.Entities))` followed by `copy(copied.Entities, state.Entities)`. This ensures the new GameState has its own independent slice header AND its own underlying array. Without this, modifying entities in the "rewound" state would corrupt the saved snapshot.

6. Build Euler Physics Integration (pos += vel per tick):
   I implemented stepPhysics() using Euler integration — the simplest deterministic physics stepping method. Each tick, I update position by adding velocity (x += velocity_x, y += velocity_y). This method is first-order and accumulates error over time, but it's deterministic and fast. For real-time networked games, determinism trumps accuracy because both client and server must produce identical results.
   Euler method in physics simulation: https://en.wikipedia.org/wiki/Euler_method

7. Implement AABB Collision Detection (Box Overlap Test):
   I implemented checkAABBCollision() using axis-aligned bounding box intersection tests. Two boxes overlap if e1.X < e2.X + size AND e1.X + size > e2.X AND the same logic holds for Y coordinates. This is O(1) per pair and requires no trigonometry or square roots, making it ideal for real-time deterministic simulation. The collision response reverses both entities' velocities (elastic collision) for the cartoon physics feel.

8. Build ProcessInput with Rollback Logic (Time Rewinding):
   I implemented the core rollback mechanism in ProcessInput(). When inputFrame < currentFrame, the system: (1) restores state from frame-1 using deep copy, (2) applies the late input at inputFrame, (3) steps physics forward, (4) saves the corrected state, and (5) re-simulates all frames from inputFrame+1 to currentFrame deterministically. This "rewinds and replays" history to incorporate the late input without breaking causality.

9. Ensure Deep Copy Prevents History Corruption:
   I verified that each saveState() call uses deepCopy() to create independent GameState instances. When ProcessInput() modifies the "rewound" state during re-simulation, it operates on a separate copy. The original snapshots in the ring buffer remain untouched. This is validated in the test suite by comparing positions at Frame 4 before and after processing a late input at Frame 5 — the Frame 4 snapshot must remain immutable.

10. Handle Ring Buffer Wraparound (Modulo Arithmetic):
    I used modulo indexing (frame % BufferSize) throughout to handle buffer wraparound. When the simulation exceeds 3600 frames, older frames are overwritten. The modulo operation ensures valid array indices and constant-time access regardless of absolute frame number. This is essential for long-running game servers that can't grow memory indefinitely.

11. Implement Deterministic Collision Response (Velocity Reversal):
    I implemented elastic collision by reversing velocities when AABB overlap is detected. For entities i and j, if they collide: i.velocity = -i.velocity and j.velocity = -j.velocity. This is not physically accurate (real elastic collisions involve momentum transfer), but it's simple, deterministic, and provides the "cartoon physics" bouncing behavior required by the spec.

12. Build Comprehensive Test Suite with Late Input Verification:
    I created tests covering: basic entity creation, Euler integration over multiple ticks, AABB collision detection and response, late jump input with rollback verification, and critically, a deep copy preservation test. The late jump test advances to Frame 10, captures Frame 4 state, sends input for Frame 5, then verifies Frame 4 snapshot was not mutated. This proves the deep copy mechanism prevents pointer aliasing corruption.

13. Result: Deterministic Rollback System with Verified Memory Safety:
    The solution implements server-side rollback netcode using deep copy semantics to prevent pointer aliasing, processes out-of-order inputs by rewinding to the input frame and re-simulating forward deterministically, uses Euler integration for predictable physics stepping, detects collisions with AABB tests in O(n²) time per frame, responds with elastic velocity reversal, and maintains a 3600-frame ring buffer with O(1) access. The test suite verifies that historical snapshots remain immutable during rollback, proving memory safety. The architecture handles the critical "memory trap" through explicit deep copying rather than relying on Go's default shallow copy behavior.
