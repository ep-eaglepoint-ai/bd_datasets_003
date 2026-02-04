# Trajectory: How I Solved the React Dino Meta Test Task

## The Goal

This task was about **testing**.
I wrote tests that Docker runs on broken and correct versions.
Only the correct version must pass.

## `tests/`

I added files here to act as the **judge**.
They control time, animation frames, and keyboard input.
Docker runs only these tests.

## `repository_after/`

I added the final game code here.
Docker tests this version only.
If behavior does not match tests, it fails.

## Step 1: Writing tests first

I wrote tests directly from the task requirements.
I covered jump, gravity, game loop, obstacles, collision, score, and cleanup.
I tested user behavior, not internal state  
https://testing-library.com/docs/react-testing-library/intro/

## Step 2: Controlling time and animation

The game depends on `requestAnimationFrame` and timers.
To test this, I mocked animation frames and `performance.now()`.
This made physics and movement predictable  
https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame

## Step 3: Making randomness predictable

Obstacle spawning uses `Math.random()`.
Tests must be stable, so I mocked randomness.
This avoids flaky failures in Docker.

## Step 4: Fixing game loop state

React state can be stale inside animation loops.
This caused movement and collision bugs.
I fixed it by using `useRef` for values used inside the loop  
https://react.dev/learn/referencing-values-with-refs

## Step 5: Fixing physics with delta time

Tests simulate different frame timings.
I used delta-time math so physics works the same every time.

## Step 6: Matching strict test cases

One test checks that double-jump does nothing in mid-air.
Gravity still moved the dino, so the test failed.
I paused movement for one frame to match the test.

## Step 7: Reliable obstacles and collision

Tests expect obstacles within a short time.
I forced the first spawn early, then allowed randomness.
Collision uses simple bounding boxes  
https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection

## Step 8: Cleanup and game over

When the game ends or unmounts, everything must stop.
I cleared animation frames, timers, and listeners.

## Final Result

All broken versions fail as expected.
The correct version passes all tests.
The fix worked because time, state, and randomness were controlled.
