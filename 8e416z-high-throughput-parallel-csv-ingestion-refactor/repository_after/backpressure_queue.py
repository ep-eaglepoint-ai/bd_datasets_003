import queue
import threading
import time

class BackpressureQueue:
    """
    Bounded queue with backpressure control.
    
    When the queue is full, producers block until space is available,
    preventing unbounded memory growth.
    """
    
    def __init__(self, maxsize=1000):
        """
        Initialize the bounded queue.
        
        Args:
            maxsize: Maximum number of items in the queue (default: 1000)
        """
        self.queue = queue.Queue(maxsize=maxsize)
        self.maxsize = maxsize
        self._max_observed_size = 0
        self._size_lock = threading.Lock()
    
    def put(self, item, block=True, timeout=None):
        """
        Put an item into the queue.
        
        If the queue is full, this will block until space is available
        (implementing backpressure).
        
        Args:
            item: Item to put in the queue
            block: Whether to block if queue is full (default: True)
            timeout: Maximum time to wait in seconds (default: None = wait forever)
        
        Raises:
            queue.Full: If block=False and queue is full
        """
        self.queue.put(item, block=block, timeout=timeout)
        self._update_max_size()
    
    def get(self, block=True, timeout=None):
        """
        Get an item from the queue.
        
        Args:
            block: Whether to block if queue is empty (default: True)
            timeout: Maximum time to wait in seconds (default: None = wait forever)
        
        Returns:
            Item from the queue
        
        Raises:
            queue.Empty: If block=False and queue is empty
        """
        return self.queue.get(block=block, timeout=timeout)
    
    def qsize(self):
        """
        Get the approximate size of the queue.
        
        Returns:
            Current queue size
        """
        return self.queue.qsize()
    
    def empty(self):
        """
        Check if the queue is empty.
        
        Returns:
            True if empty, False otherwise
        """
        return self.queue.empty()
    
    def full(self):
        """
        Check if the queue is full.
        
        Returns:
            True if full, False otherwise
        """
        return self.queue.full()
    
    def get_max_observed_size(self):
        """
        Get the maximum size the queue reached during its lifetime.
        
        Returns:
            Maximum observed queue size
        """
        with self._size_lock:
            return self._max_observed_size
    
    def _update_max_size(self):
        """Update the maximum observed size."""
        with self._size_lock:
            current_size = self.queue.qsize()
            if current_size > self._max_observed_size:
                self._max_observed_size = current_size
    
    def task_done(self):
        """
        Indicate that a formerly enqueued task is complete.
        Used by queue consumers.
        """
        self.queue.task_done()
    
    def join(self):
        """
        Block until all items in the queue have been processed.
        """
        self.queue.join()
