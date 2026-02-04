from typing import Any, Optional, List, Tuple

class PriorityStack:
    """
    A stack where each element has a priority.
    You can pop either by LIFO (stack behavior) or by highest priority.
    """

    def __init__(self):
        self._stack: List[Tuple[Any, int]] = []
        self._mode: str = "LIFO"  # can be "LIFO" or "PRIORITY"

    def push(self, item: Any, priority: int = 0):
        """
        Push an item onto the stack with an optional priority (default=0).
        """
        if not isinstance(priority, int):
            raise ValueError("Priority must be an integer")
        self._stack.append((item, priority))

    def set_mode(self, mode: str):
        """
        Set popping mode: "LIFO" for standard stack, "PRIORITY" for highest-priority first.
        """
        if mode not in ("LIFO", "PRIORITY"):
            raise ValueError("Mode must be 'LIFO' or 'PRIORITY'")
        self._mode = mode

    def pop(self) -> Any:
        """
        Pop an element according to the current mode.
        """
        if not self._stack:
            raise IndexError("Pop from empty stack")

        if self._mode == "LIFO":
            return self._stack.pop()[0]  # return the last added item

        elif self._mode == "PRIORITY":
            # find index of item with highest priority
            idx, _ = max(enumerate(self._stack), key=lambda x: x[1][1])
            return self._stack.pop(idx)[0]

    def peek(self) -> Optional[Any]:
        """
        Peek at the next item to be popped without removing it.
        """
        if not self._stack:
            return None

        if self._mode == "LIFO":
            return self._stack[-1][0]
        elif self._mode == "PRIORITY":
            return max(self._stack, key=lambda x: x[1])[0]

    def is_empty(self) -> bool:
        return len(self._stack) == 0

    def __len__(self) -> int:
        return len(self._stack)
