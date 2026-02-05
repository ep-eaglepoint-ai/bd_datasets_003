# Trajectory: Pomodoro Timer — From Requirements to a Working App

**Objective:** I wanted to build a Pomodoro Timer that behaves correctly (modes, controls, settings, sound, and history)

---

### 1. First Pass: I Started by Understanding the Constraints

Before I wrote code, I re-checked what mattered most so I wouldn’t drift:

- I must keep my changes isolated (no accidental edits to the baseline code).
- The app must have Focus / Short break / Long break, with Start / Pause / Reset.
- It must play a sound at 00:00.
- Settings must update durations and reflect immediately when the timer is not running.
- Focus history should only record a real completion (reaching 00:00 naturally).

Once I had that list, I used it like a map for the entire project.

---

### 2. Define a Correctness Contract (Requirements → Invariants)

Before I wrote the timer logic, I turned the requirements into a short list of rules that must always stay true. I used these rules to check my own work while building and while writing tests.

These were the rules I used:

- **Only one clock is in charge:** there should be a single “remaining time” value, and everything on screen should come from it.
- **Start/Pause must not create duplicate timers:** starting twice should not create two timers running at the same time.
- **Mode change is a clean reset:** switching between Focus / Short / Long should stop the timer and set the time to the full duration of that mode.
- **Reset is always safe:** reset should stop the timer and return to the full duration for the current mode.
- **Settings apply in a predictable way:** saving new durations should update what the user sees when the timer is not running.
- **Completion is a real completion:** history should only record a Focus session when the timer naturally reaches 00:00 (not when the user resets or switches mode).
- **Sound happens at 00:00:** the sound should trigger when the timer completes.

Once I had these “always true” rules written down, I could implement features without guessing.

---

### 3. I Built the Core Timer First (Because Everything Depends on It)

I started with the timer behavior because the UI and tests depend on it.

What I focused on:

- A single source of truth for remaining time.
- A clean start/pause loop that always stops when it should.
- Mode switching that stops the timer and resets to the full new duration right away.

After that foundation was stable, I layered in the required features:

- A clear `MM:SS` display.
- Mode buttons for Focus / Short / Long.
- Start, Pause, and Reset controls.
- Settings for durations.
- A sound on completion.
- Focus history saved in localStorage.

---

### 4. I Turned Each Requirement Into a Test

Instead of testing “generally,” I created tests that directly match the requirements.

This is how I chose the test cases:

- I checked the initial screen shows Focus and 25:00.
- I verified switching mode resets the timer and stops it.
- I confirmed Start/Pause/Reset do exactly what the buttons say.
- I tested settings input rules (zero and negative values should be rejected).
- I verified saving settings updates the displayed time when not running.
- I made sure saving while running does not surprise-reset the countdown.
- I confirmed Focus history is only recorded when Focus reaches 00:00 naturally.
- I confirmed Reset or mode switch before 00:00 does not create a history entry.
- I verified loading history from storage works, and bad stored data does not crash the app.
- I ensured pausing really stops the ticking.

I chose fast, lightweight tests so they run quickly in Docker and don’t need a heavy browser image.

---

### 5. Evaluation Report (How I Verified the Final Result)

After the timer behavior and tests were correct, I focused on the evaluation report so it clearly shows whether the solution meets the requirements.

What I checked in the report:

- The baseline is marked as not available (so it is `null`).
- The current run lists every test title with its outcome.
- The summary totals match the list (for example: 10 tests, 10 passed).

---
