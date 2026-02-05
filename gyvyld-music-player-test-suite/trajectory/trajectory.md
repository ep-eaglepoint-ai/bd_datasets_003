# Trajectory: Resilient Music Player Testing Architecture

## 1. Problem Analysis & Component Strategy
The primary challenge in testing this music player is the heavy reliance on imperative Browser APIs (`HTMLAudioElement`, `requestAnimationFrame`) within a declarative React state machine. The reported bugs (sync issues, track skipping) suggest a mismatch between the `TrackContext` state and the `audioRef` side effects.

* **State Synchronization:** I identified a potential "split-brain" issue where `trackIndex` and `trackIndexFromList` are managed separately. My test suite must verify that these stay in sync to prevent the "wrong song" bug.
* **The Mocking Strategy:** Since JSDOM does not fully implement `HTMLMediaElement` (e.g., `.play()` and `.pause()` are missing), I will mock the `audioRef` object manually or use `Object.defineProperty` to mock the Audio prototype.
* **Performance & Cleanup:** To catch "unexpected skips," I will focus on `useEffect` dependencies in `Controls.js` to ensure they don't trigger redundant track resets.

---

## 2. API & Logic Research: Audio & Animation
I researched the native behavior of the Web Audio API and Animation frames to ensure mocks behave realistically.

* **Logic:** The `repeat` function uses `requestAnimationFrame`. To test this without causing infinite loops in Jest, I will mock `requestAnimationFrame` and `cancelAnimationFrame` to control the "tick" manually.
* **Intl/Formatting:** While this player lacks the complexity of a world clock, the volume mapping (0-100 to 0.0-1.0) requires precise floating-point validation.
* **Progress Calculation:** I identified a **Division by Zero** risk in the CSS calculation:
    > `${(currentTime / duration) * 100}%`
    
    I must test the component's stability when `duration` is initially `0`.

---

## 3. Optimization & Testing Patterns
A Staff QA approach moves beyond simple "it renders" tests and focuses on Lifecycle and Boundary conditions.

| Strategy | Implementation |
| :--- | :--- |
| **Fake Timers** | Use `jest.useFakeTimers()` to simulate track progress without waiting in real-time. |
| **Ref Mocking** | Create a "Ref Factory" that injects a mocked object with `play`, `pause`, and `currentTime`. |
| **Reconciliation** | Use `renderHook` or a custom wrapper with `TrackProvider` to ensure context updates propagate. |

---

## 4. Testing Strategy: Scenarios & Assertions
I have mapped the requirements to specific Jest/RTL patterns:

1.  **Navigation Logic:** Invoke `handleNext` and `handlePrevious`; assert against the track object's `name` property.
2.  **Playlist Interaction:** Simulate a click on a playlist item and use `waitFor` to verify that `isPlaying` transitions to `true`.
3.  **Volume/Mute:** Spy on the `volume` setter of the mocked audio element to ensure the 0.1–1.0 mapping is mathematically correct.
4.  **Cleanup Verification:** Unmount the component and verify `cancelAnimationFrame` was called with the correct ID.

---

## 5. Key Learning Resources
Validated the architecture using high-authority resources:

* **[Testing Library: Mocking Refs](https://testing-library.com/docs/react-testing-library/faq/#how-do-i-test-refs)** — Best practices for handling `useRef` and DOM-heavy components in React.
* **[MDN Web Docs: HTMLMediaElement.play()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)** — Essential details on the Promise-based return type of the play method.
* **[Jest Docs: Timer Mocks](https://jestjs.io/docs/timer-mocks)** — Guide on using `useFakeTimers` and mocking `requestAnimationFrame`.
* **[MDN Web Docs: Window.requestAnimationFrame()](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)** — Reference for the callback behavior and the `timestamp` argument used in progress loops.
* **[GitHub Issue: JSDOM HTMLMediaElement Mocking](https://github.com/jsdom/jsdom/issues/2155)** — Community-standard workarounds for the lack of audio support in JSDOM.