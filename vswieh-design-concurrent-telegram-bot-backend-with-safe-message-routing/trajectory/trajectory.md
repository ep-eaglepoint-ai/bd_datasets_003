# Trajectory

- [Python asyncio.Task Documentation](https://docs.python.org/3/library/asyncio-task.html)
  - **Applied**: Used `asyncio.create_task` to wrap each `Update` processing. This ensures independent execution contexts where a blocked task (e.g. `/slow`) yields control back to the event loop, satisfying the non-blocking requirement.

- [Python Data Classes](https://docs.python.org/3/library/dataclasses.html)
  - **Applied**: Implemented `TaskContext` as a dataclass to bundle `chat_id` and `update` into a single context object. This object is passed through the handler chain, ensuring every response creation (`ctx.create_response`) automatically uses the correct routing ID, eliminating cross-talk.

- [Asyncio Synchronization Primitives](https://docs.python.org/3/library/asyncio-sync.html#lock)
  - **Applied**: Adopted `asyncio.Lock` for the `StateManager`. Instead of a global lock which kills concurrency, I used a dictionary of locks keyed by `user_id`. This allows User A and User B to operate in parallel, while protecting User A's state from race conditions if they send multiple simultaneous messages.

- [Python Context Managers](https://docs.python.org/3/library/contextlib.html#contextlib.asynccontextmanager)
  - **Applied**: Used `@asynccontextmanager` for `user_lock`. This effectively abstracts the lock acquisition/release logic, preventing deadlocks or unreleased locks if errors occur during state updates.
