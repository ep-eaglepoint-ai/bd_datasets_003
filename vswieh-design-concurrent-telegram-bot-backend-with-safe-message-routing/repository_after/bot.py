import asyncio
from typing import Dict, Any, Callable, List, Awaitable
from dataclasses import dataclass
from contextlib import asynccontextmanager


@dataclass
class Update:
    """Incoming Telegram update."""
    update_id: int
    chat_id: int
    text: str
    user_id: int


@dataclass
class Response:
    """Outgoing response."""
    chat_id: int
    text: str


@dataclass
class TaskContext:
    """Binds response routing to originating chat - prevents cross-user responses."""
    chat_id: int
    update: Update
    
    def create_response(self, text: str) -> Response:
        return Response(chat_id=self.chat_id, text=text)


class StateManager:
    """Per-user state with granular locking to prevent race conditions."""
    
    def __init__(self):
        self._state: Dict[int, Dict[str, Any]] = {}
        self._locks: Dict[int, asyncio.Lock] = {}
        self._meta_lock = asyncio.Lock()
    
    async def _get_lock(self, user_id: int) -> asyncio.Lock:
        async with self._meta_lock:
            if user_id not in self._locks:
                self._locks[user_id] = asyncio.Lock()
            return self._locks[user_id]
    
    @asynccontextmanager
    async def user_lock(self, user_id: int):
        lock = await self._get_lock(user_id)
        async with lock:
            yield
    
    async def get_state(self, user_id: int) -> Dict[str, Any]:
        async with self.user_lock(user_id):
            if user_id not in self._state:
                self._state[user_id] = {"message_count": 0, "last_command": None}
            return dict(self._state[user_id])
    
    async def update_state(self, user_id: int, key: str, value: Any) -> None:
        async with self.user_lock(user_id):
            if user_id not in self._state:
                self._state[user_id] = {"message_count": 0, "last_command": None}
            self._state[user_id][key] = value
    
    async def increment_count(self, user_id: int) -> int:
        # Atomic increment prevents lost updates under concurrency
        async with self.user_lock(user_id):
            if user_id not in self._state:
                self._state[user_id] = {"message_count": 0, "last_command": None}
            self._state[user_id]["message_count"] += 1
            return self._state[user_id]["message_count"]
    
    def reset(self) -> None:
        self._state.clear()
        self._locks.clear()


class ResponseDispatcher:
    """Thread-safe response logging for verification."""
    
    def __init__(self):
        self._responses: List[Response] = []
        self._lock = asyncio.Lock()
    
    async def send(self, response: Response) -> Response:
        async with self._lock:
            self._responses.append(response)
        return response
    
    @property
    def sent_responses(self) -> List[Response]:
        return list(self._responses)
    
    def reset(self) -> None:
        self._responses.clear()


HandlerType = Callable[['TelegramBot', TaskContext], Awaitable[Response]]


class TelegramBot:
    """Concurrent bot with isolated per-user processing."""
    
    def __init__(self):
        self._handlers: Dict[str, HandlerType] = {}
        self._state_manager = StateManager()
        self._dispatcher = ResponseDispatcher()
    
    @property
    def state_manager(self) -> StateManager:
        return self._state_manager
    
    @property
    def sent_responses(self) -> List[Response]:
        return self._dispatcher.sent_responses
    
    def register_handler(self, command: str, handler: HandlerType) -> None:
        self._handlers[command] = handler
    
    async def send_response(self, ctx: TaskContext, text: str) -> Response:
        # Response routes to ctx.chat_id - bound at task creation
        response = ctx.create_response(text)
        return await self._dispatcher.send(response)
    
    async def _handle_update(self, update: Update) -> Response:
        # Each update gets its own TaskContext - isolates response routing
        ctx = TaskContext(chat_id=update.chat_id, update=update)
        await self._state_manager.increment_count(update.user_id)
        
        command = update.text.split()[0] if update.text else ""
        
        if command in self._handlers:
            try:
                return await self._handlers[command](self, ctx)
            except Exception as e:
                # Error response goes only to THIS user
                return await self.send_response(ctx, f"Error: {str(e)}")
        else:
            return await self.send_response(ctx, f"Unknown command: {command}")
    
    async def process_update(self, update: Update) -> Response:
        return await self._handle_update(update)
    
    async def process_updates_concurrent(self, updates: List[Update]) -> List[Response]:
        # Each update processed as independent task - no blocking between users
        tasks = [asyncio.create_task(self._handle_update(u)) for u in updates]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        responses = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                ctx = TaskContext(chat_id=updates[i].chat_id, update=updates[i])
                responses.append(await self.send_response(ctx, f"Error: {str(result)}"))
            else:
                responses.append(result)
        return responses
    
    def reset(self) -> None:
        self._state_manager.reset()
        self._dispatcher.reset()


# Command handlers - each receives TaskContext for safe response routing

async def handle_start(bot: TelegramBot, ctx: TaskContext) -> Response:
    state = await bot.state_manager.get_state(ctx.update.user_id)
    await bot.state_manager.update_state(ctx.update.user_id, "last_command", "/start")
    return await bot.send_response(ctx, f"Welcome! Messages: {state['message_count']}")


async def handle_echo(bot: TelegramBot, ctx: TaskContext) -> Response:
    parts = ctx.update.text.split(maxsplit=1)
    text = parts[1] if len(parts) > 1 else ""
    await bot.state_manager.update_state(ctx.update.user_id, "last_command", "/echo")
    return await bot.send_response(ctx, f"Echo: {text}")


async def handle_slow(bot: TelegramBot, ctx: TaskContext) -> Response:
    # Non-blocking sleep - other users not delayed
    await asyncio.sleep(0.5)
    await bot.state_manager.update_state(ctx.update.user_id, "last_command", "/slow")
    return await bot.send_response(ctx, "Slow operation completed!")


async def handle_error(bot: TelegramBot, ctx: TaskContext) -> Response:
    await bot.state_manager.update_state(ctx.update.user_id, "last_command", "/error")
    raise ValueError("Intentional error for testing")


async def handle_count(bot: TelegramBot, ctx: TaskContext) -> Response:
    state = await bot.state_manager.get_state(ctx.update.user_id)
    await bot.state_manager.update_state(ctx.update.user_id, "last_command", "/count")
    return await bot.send_response(ctx, f"Count: {state['message_count']}")


def create_bot() -> TelegramBot:
    """Factory function to create configured bot."""
    bot = TelegramBot()
    bot.register_handler("/start", handle_start)
    bot.register_handler("/echo", handle_echo)
    bot.register_handler("/slow", handle_slow)
    bot.register_handler("/error", handle_error)
    bot.register_handler("/count", handle_count)
    return bot


async def main():
    """Demo: simulate concurrent message processing."""
    bot = create_bot()
    
    # Simulate concurrent updates from multiple users
    updates = [
        Update(1, chat_id=100, text="/start", user_id=100),
        Update(2, chat_id=200, text="/echo Hello User 200", user_id=200),
        Update(3, chat_id=300, text="/slow", user_id=300),
        Update(4, chat_id=100, text="/count", user_id=100),
    ]
    
    print("Processing concurrent updates...")
    responses = await bot.process_updates_concurrent(updates)
    
    for resp in responses:
        print(f"Chat {resp.chat_id}: {resp.text}")
    
    print(f"\nTotal responses sent: {len(bot.sent_responses)}")


if __name__ == "__main__":
    asyncio.run(main())
