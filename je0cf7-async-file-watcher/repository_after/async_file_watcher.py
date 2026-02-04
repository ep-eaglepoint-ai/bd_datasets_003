"""
AsyncFileWatcher - An asynchronous file watcher with debouncing support.

This module provides an asynchronous file watcher class that monitors a directory
for file system changes and invokes registered callback functions when modifications
are detected.
"""

import asyncio
import os
from pathlib import Path
from typing import Callable, List, Optional, Dict, Any
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileSystemEvent


class AsyncEventHandler(FileSystemEventHandler):
    """
    Custom event handler that bridges watchdog's synchronous callbacks
    to asyncio using a thread-safe queue mechanism.
    
    This handler runs in the watchdog observer thread and safely communicates
    events to the asyncio event loop using loop.call_soon_threadsafe().
    """
    
    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        queue: asyncio.Queue,
        extensions: Optional[List[str]] = None
    ):
        """
        Initialize the event handler.
        
        Args:
            loop: The asyncio event loop to communicate with.
            queue: Thread-safe queue for passing events to async context.
            extensions: Optional list of file extensions to filter.
        """
        super().__init__()
        self._loop = loop
        self._queue = queue
        self._extensions = extensions
    
    def _matches_extension(self, path: str) -> bool:
        """Check if the file matches the extension filter."""
        if self._extensions is None:
            return True
        return any(path.endswith(ext) for ext in self._extensions)
    
    def _queue_event(self, event: FileSystemEvent, event_type: str) -> None:
        """Thread-safely enqueue an event to the async queue."""
        if event.is_directory:
            return
        if not self._matches_extension(event.src_path):
            return
        
        # Thread-safe communication with the event loop
        self._loop.call_soon_threadsafe(
            self._queue.put_nowait,
            (event.src_path, event_type)
        )
    
    def on_modified(self, event: FileSystemEvent) -> None:
        """Handle file modification events."""
        self._queue_event(event, "modified")
    
    def on_created(self, event: FileSystemEvent) -> None:
        """Handle file creation events."""
        self._queue_event(event, "created")
    
    def on_deleted(self, event: FileSystemEvent) -> None:
        """Handle file deletion events."""
        self._queue_event(event, "deleted")


class AsyncFileWatcher:
    """
    An asynchronous file watcher that monitors a directory for file system changes.
    
    This class provides:
    - Recursive directory monitoring
    - File extension filtering
    - Debouncing to coalesce rapid successive changes into single callbacks
    - Multiple registered callbacks
    - Async context manager protocol (__aenter__ and __aexit__)
    
    Thread Safety:
        Uses asyncio.Queue and loop.call_soon_threadsafe() to safely bridge
        between the watchdog observer thread and the asyncio event loop.
    
    Cleanup Behavior (Design Decision):
        When stop() is called, pending debounced callbacks are CANCELLED to ensure
        immediate and clean shutdown. This is documented behavior - if you need
        pending callbacks to complete, wait for at least the debounce_interval
        before calling stop().
    
    Example Usage:
        # Basic usage
        async def main():
            watcher = AsyncFileWatcher("./src", debounce_interval=0.3, extensions=[".py"])
            watcher.on_change(lambda path, event: print(f"{event}: {path}"))
            await watcher.start()
        
        # With async context manager
        async def main():
            async with AsyncFileWatcher("./src", extensions=[".md", ".html"]) as watcher:
                watcher.on_change(my_callback)
                await watcher.start()
    """
    
    def __init__(
        self,
        directory: str,
        debounce_interval: float = 0.5,
        extensions: Optional[List[str]] = None
    ):
        """
        Initialize the AsyncFileWatcher.
        
        Args:
            directory: The directory path to watch. Must exist and be a directory.
            debounce_interval: Time in seconds to wait after the last change before 
                             triggering callback. Defaults to 0.5 seconds.
            extensions: Optional list of file extensions to filter 
                       (e.g., [".md", ".html", ".css"]). If None, all files are watched.
        
        Raises:
            ValueError: If the directory does not exist or is not a directory.
        """
        # Validate directory exists
        path = Path(directory)
        if not path.exists():
            raise ValueError(f"Directory does not exist: {directory}")
        if not path.is_dir():
            raise ValueError(f"Path is not a directory: {directory}")
        
        # Store configuration as instance attributes
        self.directory = str(path.resolve())
        self.debounce_interval = debounce_interval
        self.extensions = extensions
        
        # Callbacks storage
        self._callbacks: List[Callable[[str, str], Any]] = []
        
        # Runtime state
        self._running = False
        self._observer: Optional[Observer] = None
        self._event_queue: Optional[asyncio.Queue] = None
        self._debounce_tasks: Dict[str, asyncio.Task] = {}
        self._pending_events: Dict[str, str] = {}
    
    def on_change(self, callback: Callable[[str, str], Any]) -> None:
        """
        Register a callback function to be invoked when file changes are detected.
        
        The callback should accept two arguments:
        - file_path (str): The path of the changed file
        - event_type (str): The type of change - "modified", "created", or "deleted"
        
        Multiple callbacks can be registered and all will be invoked for each event.
        Callbacks can be synchronous or async functions.
        
        Args:
            callback: A callable accepting (file_path: str, event_type: str).
        """
        self._callbacks.append(callback)
    
    async def start(self) -> None:
        """
        Begin watching the specified directory for file changes.
        
        This method runs indefinitely until stop() is called, yielding control
        back to the event loop regularly so other coroutines can execute.
        
        The method is awaitable and integrates smoothly with asyncio.run()
        or an existing event loop.
        
        The watcher monitors the directory recursively, detecting changes in
        all subdirectories as well.
        """
        if self._running:
            return
        
        self._running = True
        loop = asyncio.get_running_loop()
        self._event_queue = asyncio.Queue()
        
        # Set up watchdog observer with custom async-bridging handler
        handler = AsyncEventHandler(
            loop=loop,
            queue=self._event_queue,
            extensions=self.extensions
        )
        
        self._observer = Observer()
        # recursive=True enables recursive directory watching
        self._observer.schedule(handler, self.directory, recursive=True)
        self._observer.start()
        
        try:
            while self._running:
                try:
                    # Wait for events with timeout for responsiveness
                    file_path, event_type = await asyncio.wait_for(
                        self._event_queue.get(),
                        timeout=0.1
                    )
                    await self._schedule_debounced_callback(file_path, event_type)
                except asyncio.TimeoutError:
                    # No event received, continue loop to check _running flag
                    continue
                except asyncio.CancelledError:
                    break
        finally:
            self._cleanup()
    
    async def _schedule_debounced_callback(self, file_path: str, event_type: str) -> None:
        """
        Schedule a debounced callback for a file event.
        
        If a file is modified multiple times within the debounce interval,
        only one callback will fire after the interval has passed since
        the last modification.
        
        Args:
            file_path: Path of the changed file.
            event_type: Type of change event.
        """
        # Cancel existing debounce task for this file if present
        if file_path in self._debounce_tasks:
            self._debounce_tasks[file_path].cancel()
            try:
                await self._debounce_tasks[file_path]
            except asyncio.CancelledError:
                pass
        
        # Store latest event type for this file
        self._pending_events[file_path] = event_type
        
        # Create new debounce task
        self._debounce_tasks[file_path] = asyncio.create_task(
            self._execute_after_debounce(file_path)
        )
    
    async def _execute_after_debounce(self, file_path: str) -> None:
        """
        Wait for debounce interval then execute all registered callbacks.
        
        Args:
            file_path: Path of the changed file.
        """
        try:
            await asyncio.sleep(self.debounce_interval)
            
            event_type = self._pending_events.pop(file_path, "modified")
            self._debounce_tasks.pop(file_path, None)
            
            # Invoke all registered callbacks
            for callback in self._callbacks:
                try:
                    result = callback(file_path, event_type)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    # Don't let one callback failure stop others
                    # In production, you might want to log this
                    pass
        except asyncio.CancelledError:
            # Clean up on cancellation
            self._pending_events.pop(file_path, None)
            self._debounce_tasks.pop(file_path, None)
            raise
    
    def stop(self) -> None:
        """
        Gracefully terminate the file watching operation.
        
        After stop() is called, the start() coroutine will exit cleanly without
        raising exceptions.
        
        Design Decision:
            Pending debounced callbacks are CANCELLED to ensure immediate and
            clean shutdown. If you need pending callbacks to complete, wait
            for at least debounce_interval before calling stop().
        """
        self._running = False
    
    def _cleanup(self) -> None:
        """
        Clean up all resources.
        
        This method:
        - Stops and joins the watchdog observer thread
        - Cancels all pending asyncio debounce tasks
        - Clears all internal state
        """
        # Stop and join the watchdog observer
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=2.0)
            self._observer = None
        
        # Cancel all pending debounce tasks
        for task in list(self._debounce_tasks.values()):
            task.cancel()
        self._debounce_tasks.clear()
        self._pending_events.clear()
        self._event_queue = None
    
    async def __aenter__(self) -> "AsyncFileWatcher":
        """
        Async context manager entry.
        
        Returns the watcher instance for use in async with statements.
        
        Example:
            async with AsyncFileWatcher("./src") as watcher:
                watcher.on_change(callback)
                await watcher.start()
        """
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """
        Async context manager exit with cleanup.
        
        Ensures proper cleanup when exiting the context manager, including
        stopping the observer and cancelling pending tasks.
        """
        self.stop()
        await asyncio.sleep(0.05)
        self._cleanup()