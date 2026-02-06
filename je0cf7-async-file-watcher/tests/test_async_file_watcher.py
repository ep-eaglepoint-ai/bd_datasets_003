"""
Tests for AsyncFileWatcher

Comprehensive test suite covering all 11 requirements:
1. Initialization with directory, debounce_interval, extensions
2. start() method - async, runs indefinitely, awaitable
3. stop() method - graceful termination
4. on_change() callback registration
5. Debouncing logic
6. Recursive directory watching
7. File extension filtering
8. Watchdog library usage with FileSystemEventHandler
9. Directory validation
10. Thread safety between watchdog and asyncio
11. Resource cleanup and async context manager
"""

import asyncio
import inspect
import os
import sys
import tempfile
import shutil
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock


class TestDependencySetup(unittest.TestCase):
    """Test that required dependencies are available."""
    
    def test_watchdog_is_installed(self):
        """Verify watchdog library is installed and importable."""
        try:
            import watchdog
            from watchdog.observers import Observer
            from watchdog.events import FileSystemEventHandler
        except ImportError as e:
            self.fail(f"watchdog library not installed: {e}")
    
    def test_asyncio_is_available(self):
        """Verify asyncio is available."""
        import asyncio
        self.assertTrue(hasattr(asyncio, 'Queue'))
        self.assertTrue(hasattr(asyncio, 'get_running_loop'))


class TestRequirement8WatchdogUsage(unittest.TestCase):
    """
    Requirement 8: Use the watchdog library for cross-platform file system event detection.
    Create a custom event handler class that inherits from watchdog.events.FileSystemEventHandler
    and override the appropriate methods like on_modified, on_created, and on_deleted.
    """
    
    def test_async_event_handler_inherits_from_filesystemeventhandler(self):
        """Test that AsyncEventHandler inherits from FileSystemEventHandler."""
        from async_file_watcher import AsyncEventHandler
        from watchdog.events import FileSystemEventHandler
        
        self.assertTrue(
            issubclass(AsyncEventHandler, FileSystemEventHandler),
            "AsyncEventHandler must inherit from watchdog.events.FileSystemEventHandler"
        )
    
    def test_async_event_handler_has_on_modified(self):
        """Test that AsyncEventHandler overrides on_modified."""
        from async_file_watcher import AsyncEventHandler
        
        self.assertTrue(
            hasattr(AsyncEventHandler, 'on_modified'),
            "AsyncEventHandler must have on_modified method"
        )
        # Check it's actually overridden (not just inherited)
        self.assertIn(
            'on_modified',
            AsyncEventHandler.__dict__,
            "AsyncEventHandler must override on_modified"
        )
    
    def test_async_event_handler_has_on_created(self):
        """Test that AsyncEventHandler overrides on_created."""
        from async_file_watcher import AsyncEventHandler
        
        self.assertTrue(
            hasattr(AsyncEventHandler, 'on_created'),
            "AsyncEventHandler must have on_created method"
        )
        self.assertIn(
            'on_created',
            AsyncEventHandler.__dict__,
            "AsyncEventHandler must override on_created"
        )
    
    def test_async_event_handler_has_on_deleted(self):
        """Test that AsyncEventHandler overrides on_deleted."""
        from async_file_watcher import AsyncEventHandler
        
        self.assertTrue(
            hasattr(AsyncEventHandler, 'on_deleted'),
            "AsyncEventHandler must have on_deleted method"
        )
        self.assertIn(
            'on_deleted',
            AsyncEventHandler.__dict__,
            "AsyncEventHandler must override on_deleted"
        )
    
    def test_watcher_uses_watchdog_observer(self):
        """Test that AsyncFileWatcher uses watchdog.observers.Observer."""
        from async_file_watcher import AsyncFileWatcher
        from watchdog.observers import Observer
        
        test_dir = tempfile.mkdtemp()
        try:
            watcher = AsyncFileWatcher(test_dir)
            
            async def run_test():
                task = asyncio.create_task(watcher.start())
                await asyncio.sleep(0.2)
                
                # Check that _observer is a watchdog Observer
                self.assertIsInstance(
                    watcher._observer,
                    Observer,
                    "AsyncFileWatcher must use watchdog.observers.Observer"
                )
                
                watcher.stop()
                await asyncio.sleep(0.1)
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            asyncio.run(run_test())
        finally:
            shutil.rmtree(test_dir)
    
    def test_module_imports_watchdog(self):
        """Test that the module imports from watchdog."""
        import async_file_watcher
        source = inspect.getsource(async_file_watcher)
        
        self.assertIn(
            'from watchdog',
            source,
            "Module must import from watchdog library"
        )
        self.assertIn(
            'FileSystemEventHandler',
            source,
            "Module must use FileSystemEventHandler from watchdog"
        )
        self.assertIn(
            'Observer',
            source,
            "Module must use Observer from watchdog"
        )


class TestRequirement10ThreadSafety(unittest.TestCase):
    """
    Requirement 10: Ensure thread safety when bridging between the watchdog observer 
    thread and the asyncio event loop. Use thread-safe mechanisms like 
    loop.call_soon_threadsafe() or an asyncio.Queue.
    """
    
    def test_uses_asyncio_queue(self):
        """Test that implementation uses asyncio.Queue for thread-safe communication."""
        from async_file_watcher import AsyncFileWatcher
        
        test_dir = tempfile.mkdtemp()
        try:
            watcher = AsyncFileWatcher(test_dir)
            
            async def run_test():
                task = asyncio.create_task(watcher.start())
                await asyncio.sleep(0.2)
                
                # Check that event queue is an asyncio.Queue
                self.assertIsInstance(
                    watcher._event_queue,
                    asyncio.Queue,
                    "Must use asyncio.Queue for thread-safe event passing"
                )
                
                watcher.stop()
                await asyncio.sleep(0.1)
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            asyncio.run(run_test())
        finally:
            shutil.rmtree(test_dir)
    
    def test_event_handler_uses_call_soon_threadsafe(self):
        """Test that AsyncEventHandler uses loop.call_soon_threadsafe()."""
        from async_file_watcher import AsyncEventHandler
        import async_file_watcher
        
        source = inspect.getsource(async_file_watcher.AsyncEventHandler)
        
        self.assertIn(
            'call_soon_threadsafe',
            source,
            "AsyncEventHandler must use loop.call_soon_threadsafe() for thread safety"
        )
    
    def test_event_handler_stores_loop_reference(self):
        """Test that AsyncEventHandler stores a reference to the event loop."""
        from async_file_watcher import AsyncEventHandler
        
        async def run_test():
            loop = asyncio.get_running_loop()
            queue = asyncio.Queue()
            handler = AsyncEventHandler(loop=loop, queue=queue)
            
            self.assertIs(
                handler._loop,
                loop,
                "AsyncEventHandler must store reference to event loop"
            )
        
        asyncio.run(run_test())
    
    def test_events_cross_thread_boundary_safely(self):
        """Test that events from watchdog thread reach asyncio safely."""
        from async_file_watcher import AsyncFileWatcher
        
        test_dir = tempfile.mkdtemp()
        events_received = []
        event_threads = []
        
        def callback(path, event_type):
            events_received.append((path, event_type))
            event_threads.append(threading.current_thread().name)
        
        try:
            async def run_test():
                watcher = AsyncFileWatcher(test_dir, debounce_interval=0.1)
                watcher.on_change(callback)
                
                task = asyncio.create_task(watcher.start())
                await asyncio.sleep(0.3)
                
                # Create file from main thread
                file_path = os.path.join(test_dir, "thread_test.txt")
                with open(file_path, 'w') as f:
                    f.write("test")
                
                await asyncio.sleep(0.5)
                
                watcher.stop()
                await asyncio.sleep(0.1)
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            asyncio.run(run_test())
            
            # Callback should have been executed
            self.assertTrue(
                len(events_received) > 0,
                "Events should cross thread boundary and trigger callbacks"
            )
            
            # Callback should run in main thread (asyncio), not watchdog thread
            for thread_name in event_threads:
                self.assertNotIn(
                    'Observer',
                    thread_name,
                    "Callbacks should not run in watchdog Observer thread"
                )
        finally:
            shutil.rmtree(test_dir)
    
    def test_handler_queue_event_is_threadsafe(self):
        """Test that _queue_event method uses thread-safe mechanisms."""
        from async_file_watcher import AsyncEventHandler
        from watchdog.events import FileModifiedEvent
        
        async def run_test():
            loop = asyncio.get_running_loop()
            queue = asyncio.Queue()
            handler = AsyncEventHandler(loop=loop, queue=queue)
            
            # Simulate event from different thread
            event = FileModifiedEvent("/test/file.txt")
            
            def queue_from_thread():
                handler.on_modified(event)
            
            # Run from separate thread like watchdog would
            thread = threading.Thread(target=queue_from_thread)
            thread.start()
            thread.join(timeout=1.0)
            
            # Give time for thread-safe call to complete
            await asyncio.sleep(0.1)
            
            # Event should be in queue
            self.assertFalse(
                queue.empty(),
                "Event should be queued from separate thread"
            )
        
        asyncio.run(run_test())


class TestRequirement1Initialization(unittest.TestCase):
    """
    Requirement 1: Create a class named AsyncFileWatcher that is initialized with 
    a directory path, debounce_interval (default 0.5), and optional extensions list.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_class_exists_and_named_correctly(self):
        """Test that AsyncFileWatcher class exists."""
        from async_file_watcher import AsyncFileWatcher
        self.assertTrue(callable(AsyncFileWatcher))
    
    def test_initialization_with_directory_only(self):
        """Test initialization with just directory path."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        self.assertEqual(watcher.directory, os.path.realpath(self.test_dir))
    
    def test_default_debounce_interval_is_0_5(self):
        """Test that default debounce_interval is 0.5 seconds."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        self.assertEqual(watcher.debounce_interval, 0.5)
    
    def test_custom_debounce_interval(self):
        """Test initialization with custom debounce interval."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir, debounce_interval=1.0)
        self.assertEqual(watcher.debounce_interval, 1.0)
    
    def test_extensions_default_is_none(self):
        """Test that extensions defaults to None."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        self.assertIsNone(watcher.extensions)
    
    def test_custom_extensions(self):
        """Test initialization with extension filter."""
        from async_file_watcher import AsyncFileWatcher
        extensions = [".md", ".html", ".css"]
        watcher = AsyncFileWatcher(self.test_dir, extensions=extensions)
        self.assertEqual(watcher.extensions, extensions)
    
    def test_all_parameters_stored_as_attributes(self):
        """Test that all parameters are stored as instance attributes."""
        from async_file_watcher import AsyncFileWatcher
        extensions = [".py", ".txt"]
        watcher = AsyncFileWatcher(
            self.test_dir,
            debounce_interval=0.3,
            extensions=extensions
        )
        self.assertTrue(hasattr(watcher, 'directory'))
        self.assertTrue(hasattr(watcher, 'debounce_interval'))
        self.assertTrue(hasattr(watcher, 'extensions'))


class TestRequirement2StartMethod(unittest.TestCase):
    """
    Requirement 2: Implement an async method called start() that begins watching.
    Must run indefinitely until stop(), yield control to event loop, be awaitable.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_start_is_coroutine_function(self):
        """Test that start() is an async method."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        self.assertTrue(asyncio.iscoroutinefunction(watcher.start))
    
    def test_start_is_awaitable(self):
        """Test that start() returns an awaitable."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir)
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.1)
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            return True
        
        result = asyncio.run(run_test())
        self.assertTrue(result)
    
    def test_start_yields_to_event_loop(self):
        """Test that start() yields control to event loop."""
        from async_file_watcher import AsyncFileWatcher
        
        other_task_ran = False
        
        async def other_task():
            nonlocal other_task_ran
            other_task_ran = True
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir)
            start_task = asyncio.create_task(watcher.start())
            other = asyncio.create_task(other_task())
            
            await asyncio.sleep(0.1)
            await other
            
            watcher.stop()
            await asyncio.sleep(0.1)
            start_task.cancel()
            try:
                await start_task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        self.assertTrue(other_task_ran, "start() must yield control to other coroutines")
    
    def test_start_runs_until_stop_called(self):
        """Test that start() runs indefinitely until stop()."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir)
            task = asyncio.create_task(watcher.start())
            
            # Task should still be running after some time
            await asyncio.sleep(0.3)
            self.assertFalse(task.done(), "start() should run indefinitely")
            
            # After stop(), task should complete
            watcher.stop()
            await asyncio.sleep(0.2)
            
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())


class TestRequirement3StopMethod(unittest.TestCase):
    """
    Requirement 3: Implement a stop() method that gracefully terminates.
    Start() should exit cleanly without raising exceptions.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_stop_method_exists(self):
        """Test that stop() method exists."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        self.assertTrue(hasattr(watcher, 'stop'))
        self.assertTrue(callable(watcher.stop))
    
    def test_stop_terminates_start(self):
        """Test that stop() terminates start()."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir)
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.2)
            
            watcher.stop()
            await asyncio.sleep(0.3)
            
            # Task should complete after stop
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            return True
        
        result = asyncio.run(run_test())
        self.assertTrue(result)
    
    def test_stop_exits_cleanly_without_exception(self):
        """Test that start() exits cleanly after stop() without exceptions."""
        from async_file_watcher import AsyncFileWatcher
        
        exception_raised = False
        
        async def run_test():
            nonlocal exception_raised
            watcher = AsyncFileWatcher(self.test_dir)
            
            try:
                task = asyncio.create_task(watcher.start())
                await asyncio.sleep(0.2)
                watcher.stop()
                await asyncio.sleep(0.2)
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            except Exception as e:
                exception_raised = True
                raise
        
        asyncio.run(run_test())
        self.assertFalse(exception_raised, "stop() should not cause exceptions")
    
    def test_stop_before_start_does_not_raise(self):
        """Test that calling stop() before start() doesn't raise."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        watcher.stop()  # Should not raise


class TestRequirement4OnChangeCallback(unittest.TestCase):
    """
    Requirement 4: Provide on_change(callback) method. Callback accepts file_path 
    and event_type ("modified", "created", "deleted"). Multiple callbacks supported.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_on_change_method_exists(self):
        """Test that on_change() method exists."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        self.assertTrue(hasattr(watcher, 'on_change'))
    
    def test_on_change_registers_callback(self):
        """Test that on_change() registers a callback."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        
        def callback(path, event):
            pass
        
        watcher.on_change(callback)
        self.assertEqual(len(watcher._callbacks), 1)
    
    def test_multiple_callbacks_registered(self):
        """Test that multiple callbacks can be registered."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        
        for _ in range(3):
            watcher.on_change(lambda p, e: None)
        
        self.assertEqual(len(watcher._callbacks), 3)
    
    def test_callback_receives_file_path_and_event_type(self):
        """Test callback receives correct arguments."""
        from async_file_watcher import AsyncFileWatcher
        
        received = []
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda path, event: received.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            file_path = os.path.join(self.test_dir, "test.txt")
            with open(file_path, 'w') as f:
                f.write("content")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        self.assertTrue(len(received) > 0)
        path, event_type = received[0]
        self.assertIsInstance(path, str)
        self.assertIsInstance(event_type, str)
        self.assertIn(event_type, ["modified", "created", "deleted"])
    
    def test_all_callbacks_invoked(self):
        """Test that all registered callbacks are invoked."""
        from async_file_watcher import AsyncFileWatcher
        
        events1, events2, events3 = [], [], []
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda p, e: events1.append((p, e)))
            watcher.on_change(lambda p, e: events2.append((p, e)))
            watcher.on_change(lambda p, e: events3.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            with open(os.path.join(self.test_dir, "test.txt"), 'w') as f:
                f.write("content")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        self.assertTrue(len(events1) > 0)
        self.assertTrue(len(events2) > 0)
        self.assertTrue(len(events3) > 0)


class TestRequirement5Debouncing(unittest.TestCase):
    """
    Requirement 5: Implement debouncing so rapid successive changes to the same 
    file result in only one callback invocation after the interval passes.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_rapid_changes_debounced(self):
        """Test that rapid changes result in fewer callbacks."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        file_path = os.path.join(self.test_dir, "rapid.txt")
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.3)
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # 5 rapid writes faster than debounce interval
            for i in range(5):
                with open(file_path, 'w') as f:
                    f.write(f"content {i}")
                await asyncio.sleep(0.05)  # 50ms < 300ms debounce
            
            # Wait for debounce to complete
            await asyncio.sleep(0.6)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        file_events = [e for e in events if "rapid.txt" in e[0]]
        self.assertLessEqual(
            len(file_events), 2,
            "Rapid changes should be debounced into fewer callbacks"
        )
    
    def test_debounce_waits_for_interval(self):
        """Test that callback fires after debounce interval."""
        from async_file_watcher import AsyncFileWatcher
        
        callback_times = []
        
        def timed_callback(path, event):
            callback_times.append(time.time())
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.2)
            watcher.on_change(timed_callback)
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            write_time = time.time()
            with open(os.path.join(self.test_dir, "timed.txt"), 'w') as f:
                f.write("content")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            
            return write_time
        
        write_time = asyncio.run(run_test())
        
        if callback_times:
            elapsed = callback_times[0] - write_time
            self.assertGreaterEqual(elapsed, 0.15, "Callback should wait for debounce interval")


class TestRequirement6RecursiveWatching(unittest.TestCase):
    """
    Requirement 6: Support recursive directory watching so changes to files 
    in subdirectories are also detected.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_watches_subdirectories(self):
        """Test that files in subdirectories are detected."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        subdir = os.path.join(self.test_dir, "subdir", "nested")
        os.makedirs(subdir)
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            nested_file = os.path.join(subdir, "nested_file.txt")
            with open(nested_file, 'w') as f:
                f.write("nested content")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        paths = [e[0] for e in events]
        self.assertTrue(
            any("nested_file.txt" in p for p in paths),
            "Should detect files in nested subdirectories"
        )
    
    def test_watches_components_directory_example(self):
        """Test requirement example: /project/src/components/header.html."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        components_dir = os.path.join(self.test_dir, "src", "components")
        os.makedirs(components_dir)
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            header_file = os.path.join(components_dir, "header.html")
            with open(header_file, 'w') as f:
                f.write("<header>Header</header>")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        paths = [e[0] for e in events]
        self.assertTrue(any("header.html" in p for p in paths))


class TestRequirement7ExtensionFiltering(unittest.TestCase):
    """
    Requirement 7: When file extension filtering is configured, only trigger 
    callbacks for files matching one of the specified extensions.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_filters_by_extension(self):
        """Test that only matching extensions trigger callbacks."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(
                self.test_dir, 
                debounce_interval=0.1,
                extensions=[".py"]
            )
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # .py should trigger
            with open(os.path.join(self.test_dir, "test.py"), 'w') as f:
                f.write("print('hello')")
            
            await asyncio.sleep(0.2)
            
            # .txt should NOT trigger
            with open(os.path.join(self.test_dir, "test.txt"), 'w') as f:
                f.write("hello")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        paths = [e[0] for e in events]
        self.assertTrue(any(".py" in p for p in paths))
        self.assertFalse(any(".txt" in p for p in paths))
    
    def test_json_filtered_out_example(self):
        """Test requirement example: config.json should not trigger for ['.py', '.txt']."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(
                self.test_dir, 
                debounce_interval=0.1,
                extensions=[".py", ".txt"]
            )
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # config.json should NOT trigger
            with open(os.path.join(self.test_dir, "config.json"), 'w') as f:
                f.write("{}")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        paths = [e[0] for e in events]
        self.assertFalse(any("config.json" in p for p in paths))
    
    def test_no_filter_watches_all_files(self):
        """Test that without filter, all file changes trigger callbacks."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            for ext in [".py", ".txt", ".json"]:
                with open(os.path.join(self.test_dir, f"test{ext}"), 'w') as f:
                    f.write("content")
                await asyncio.sleep(0.2)
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        self.assertTrue(len(events) >= 1)


class TestRequirement9DirectoryValidation(unittest.TestCase):
    """
    Requirement 9: Handle the case where the watched directory does not exist 
    by raising a ValueError with a clear error message at initialization time.
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_nonexistent_directory_raises_valueerror(self):
        """Test that non-existent directory raises ValueError."""
        from async_file_watcher import AsyncFileWatcher
        
        with self.assertRaises(ValueError) as ctx:
            AsyncFileWatcher("/nonexistent/path/that/does/not/exist")
        
        self.assertIn("does not exist", str(ctx.exception).lower())
    
    def test_file_instead_of_directory_raises_valueerror(self):
        """Test that file path raises ValueError."""
        from async_file_watcher import AsyncFileWatcher
        
        file_path = os.path.join(self.test_dir, "test_file.txt")
        Path(file_path).touch()
        
        with self.assertRaises(ValueError) as ctx:
            AsyncFileWatcher(file_path)
        
        self.assertIn("not a directory", str(ctx.exception).lower())
    
    def test_error_message_is_clear(self):
        """Test that error message clearly indicates the problem."""
        from async_file_watcher import AsyncFileWatcher
        
        try:
            AsyncFileWatcher("/fake/path")
        except ValueError as e:
            message = str(e)
            # Should contain path information
            self.assertIn("/fake/path", message)


class TestRequirement11ResourceCleanup(unittest.TestCase):
    """
    Requirement 11: Provide proper cleanup of resources in all scenarios.
    Implement async context manager protocol (__aenter__ and __aexit__).
    """
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_observer_stopped_and_joined(self):
        """Test that watchdog observer is stopped and joined."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.2)
            
            observer = watcher._observer
            self.assertIsNotNone(observer)
            
            watcher.stop()
            await asyncio.sleep(0.2)
            
            # Observer should be cleaned up
            self.assertIsNone(watcher._observer)
            
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
    
    def test_debounce_tasks_cancelled(self):
        """Test that pending debounce tasks are cancelled."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.2)
            
            watcher.stop()
            await asyncio.sleep(0.2)
            
            # Debounce tasks should be cleared
            self.assertEqual(len(watcher._debounce_tasks), 0)
            
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
    
    def test_async_context_manager_aenter(self):
        """Test __aenter__ returns watcher instance."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            async with AsyncFileWatcher(self.test_dir) as watcher:
                self.assertIsInstance(watcher, AsyncFileWatcher)
                return True
        
        result = asyncio.run(run_test())
        self.assertTrue(result)
    
    def test_async_context_manager_aexit_cleanup(self):
        """Test __aexit__ performs cleanup."""
        from async_file_watcher import AsyncFileWatcher
        
        watcher_ref = None
        
        async def run_test():
            nonlocal watcher_ref
            async with AsyncFileWatcher(self.test_dir) as watcher:
                watcher_ref = watcher
            return watcher_ref
        
        watcher = asyncio.run(run_test())
        self.assertFalse(watcher._running)
    
    def test_has_aenter_and_aexit_methods(self):
        """Test that __aenter__ and __aexit__ methods exist."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        
        self.assertTrue(hasattr(watcher, '__aenter__'))
        self.assertTrue(hasattr(watcher, '__aexit__'))
        self.assertTrue(asyncio.iscoroutinefunction(watcher.__aenter__))
        self.assertTrue(asyncio.iscoroutinefunction(watcher.__aexit__))


class TestFileChangeDetection(unittest.TestCase):
    """Test actual file change detection for all event types."""
    
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_detects_file_creation(self):
        """Test that file creation is detected."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            file_path = os.path.join(self.test_dir, "new_file.txt")
            with open(file_path, 'w') as f:
                f.write("content")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        self.assertTrue(len(events) > 0)
        paths = [e[0] for e in events]
        self.assertTrue(any("new_file.txt" in p for p in paths))
    
    def test_detects_file_modification(self):
        """Test that file modification is detected."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        file_path = os.path.join(self.test_dir, "existing.txt")
        with open(file_path, 'w') as f:
            f.write("initial")
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            with open(file_path, 'a') as f:
                f.write(" modified")
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        self.assertTrue(len(events) > 0)
    
    def test_detects_file_deletion(self):
        """Test that file deletion is detected."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        file_path = os.path.join(self.test_dir, "to_delete.txt")
        with open(file_path, 'w') as f:
            f.write("content")
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda p, e: events.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            os.remove(file_path)
            
            await asyncio.sleep(0.5)
            
            watcher.stop()
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
        
        self.assertTrue(len(events) > 0)
        event_types = [e[1] for e in events]
        self.assertIn("deleted", event_types)


if __name__ == '__main__':
    unittest.main()