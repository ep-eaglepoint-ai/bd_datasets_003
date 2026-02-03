from collections import OrderedDict
import time
from typing import Any, Optional

class LRUCache:
    def __init__(self, capacity: int, ttl_seconds: float = None):
        if capacity <= 0:
            raise ValueError("Capacity must be positive")
        self.capacity = capacity
        self.ttl = ttl_seconds
        self.cache = OrderedDict()

    def get(self, key: Any) -> Optional[Any]:
        if key not in self.cache:
            return None
        value, timestamp = self.cache[key]
        if self.ttl is not None:
            if time.time() - timestamp > self.ttl:
                del self.cache[key]
                return None
        self.cache.move_to_end(key)
        return value

    def put(self, key: Any, value: Any) -> None:
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = (value, time.time())
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=True)

    def size(self) -> int:
        return len(self.cache)

    def clear(self) -> None:
        self.cache.clear()
