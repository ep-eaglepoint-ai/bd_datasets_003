# Trajectory: How I Solved the React Dino Game Test Suite Task

## Goal

The goal was to build a reliable test suite that validates a React Dino Game.

The tests must:

I added the files here to act as the **judge**.
They control time, animation frames, and keyboard input.
Docker runs only these tests.

---

## Step 1: Writing behavior-based tests

I wrote tests based on the actual game requirements:

- Game starts in idle state
- Space/ArrowUp starts the game and triggers jump
- Gravity updates dino position every frame
- Double jump is prevented while airborne
- Collision triggers gameOver
- Score increases and high score persists
- Cleanup stops animation and timers

I tested visible behavior using React Testing Library, not internal variables.

Reference:  
https://testing-library.com/docs/react-testing-library/intro/

---

## Step 2: Controlling animation and time

The game uses requestAnimationFrame and timers.

To test correctly, I mocked:

- requestAnimationFrame
- performance.now()
- timers using Jest

This allowed me to manually advance frames and verify physics behavior.

Reference:  
https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame

---

## Step 3: Making obstacle spawning predictable

Obstacle spawning uses Math.random().

To ensure reliable tests, I mocked Math.random() so obstacles spawn early.

This allowed tests to verify:

- obstacle spawning
- obstacle movement
- collision detection

Reference:  
https://jestjs.io/docs/mock-functions

---

## Step 4: Ensuring correct physics and game loop

I verified that the implementation:

- Uses delta time for frame-independent physics
- Prevents double jumps using jump state
- Moves obstacles correctly
- Detects collisions using bounding boxes

Reference:  
https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection

---

## Step 5: Verifying cleanup and state transitions

I wrote tests to confirm:

- cancelAnimationFrame is called on unmount
- timers are cleared
- game transitions correctly between idle, running, paused, and gameOver

This ensures no memory leaks or incorrect behavior.

---

## Step 6: Validating using Docker meta tests

The Docker meta test runs the test suite against:

- broken implementations (must fail)
- correct implementation (must pass)

My tests correctly failed all broken versions and passed the correct version.

---

## Final Result

The test suite reliably validates Dino Game behavior.

It confirms correct physics, collision detection, score handling, and cleanup.

All meta tests passed successfully, proving the tests work correctly.
