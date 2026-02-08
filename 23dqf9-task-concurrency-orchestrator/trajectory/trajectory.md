# How I fixed the QueueManager + Vitest fake timers nightmare
(concurrency=3, jobs never starting, executing always 0, spy called wrong times, etc.)

Date: Feb 2026  
Environment: Docker + Node 20 + Vitest 2.1.9 + TypeScript

## Symptoms (what kept failing)

- `q.getStatus().executing` always 0 even after `addJob()` + `advanceTimersByTime()`
- Tests expecting 3 executing → get 0
- Tests expecting 2 executing after some time → still 0 or wrong
- Microtask test: spy called 8× instead of 2× or vice versa
- `vi.runAllTimersAsync()` didn't help at all in modern mode

## Timeline / what I tried (in roughly chronological order)

1. First thought: classic stutter gap → completion handler not calling next job fast enough  
   → No, jobs weren't even **starting**

2. Added smoke test (one job, delay(50)) → still executing = 0

3. Checked if `job.task()` is actually called  
   → yes (console.log inside task appeared in some cases)

4. Tried `await Promise.resolve()` after every addJob → sometimes helped, sometimes not

5. Read Vitest docs → fakeTimers section → saw legacy vs modern difference  
   → Tried `vi.useFakeTimers({ legacyFakeTimers: true })`  
   → **Nothing changed** (still 0)

6. Then I remembered: **modern fake timers do NOT advance promises automatically**  
   (they only mock timers — Promise microtasks still need flushing)

7. Tried combinations:

   ```ts
   await vi.advanceTimersByTime(0);
   await vi.runAllTimersAsync();
   await Promise.resolve();
   await Promise.resolve();
→ sometimes 2 jobs start, sometimes 8, very unstable

8. Real breakthrough: the jobs start synchronously, but state update + inFlight.set is visible immediately
→ But Vitest fake timer world + Docker container timing made it flaky
9. Key realization #1: in modern fake timers, Promise.resolve() inside job does NOT wait for timer advance
→ So microtask-only jobs finish too fast → all 8 start before any flush happens


Resources
https://vitest.dev/api/vi.html#vi-usefaketimers
https://github.com/vitest-dev/vitest/discussions/4257
https://stackoverflow.com/questions/76012345/vitest-fake-timers-not-advancing-promises-correctly