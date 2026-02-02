import threading
import time
from typing import Any, Optional
from dataclasses import dataclass


@dataclass
class Node:
    value: Any
    next: Optional['Node'] = None


class MPSCQueue:
    
    def __init__(self, capacity: Optional[int] = None):
        dummy = Node(value=None)
        self.head = dummy
        self.tail = dummy
        self.capacity = capacity
        self._size = 0
        self.lock = threading.Lock()
    
    def enqueue(self, message: Any) -> bool:
        with self.lock:
            if self.capacity is not None and self._size >= self.capacity:
                return False
            
            new_node = Node(value=message)
            self.tail.next = new_node
            self.tail = new_node
            self._size += 1
            return True
    
    def dequeue(self) -> Optional[Any]:
        with self.lock:
            if self.head.next is None:
                return None
            
            node = self.head.next
            self.head = node
            self._size -= 1
            return node.value
    
    def size(self) -> int:
        with self.lock:
            return self._size
    
    def is_empty(self) -> bool:
        with self.lock:
            return self.head.next is None
    
    def is_full(self) -> bool:
        if self.capacity is None:
            return False
        with self.lock:
            return self._size >= self.capacity


class NaiveMPSCQueue:
    
    def __init__(self, capacity: Optional[int] = None):
        dummy = Node(value=None)
        self.head = dummy
        self.tail = dummy
        self.capacity = capacity
        self._size = 0
    
    def enqueue(self, message: Any) -> bool:
        if self.capacity is not None and self._size >= self.capacity:
            return False
        
        new_node = Node(value=message)
        self.tail.next = new_node
        self.tail = new_node
        self._size += 1
        return True
    
    def dequeue(self) -> Optional[Any]:
        if self.head.next is None:
            return None
        
        node = self.head.next
        self.head = node
        self._size -= 1
        return node.value
    
    def size(self) -> int:
        return self._size
    
    def is_empty(self) -> bool:
        return self.head.next is None
    
    def is_full(self) -> bool:
        if self.capacity is None:
            return False
        return self._size >= self.capacity
