"""
Tests for AsyncFileWatcher

Comprehensive test suite covering all requirements:
- Initialization and validation
- File change detection (create, modify, delete)
- Recursive directory watching
- Extension filtering
- Debouncing
- Multiple callbacks
- Resource cleanup
- Async context manager
"""

import asyncio
import os
import tempfile
import shutil
import unittest
from pathlib import Path


class TestAsyncFileWatcherInitialization(unittest.TestCase):
    """Test cases for AsyncFileWatcher initialization."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_initialization_with_valid_directory(self):
        """Test that watcher initializes correctly with valid directory."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        self.assertEqual(watcher.directory, os.path.realpath(self.test_dir))
        self.assertEqual(watcher.debounce_interval, 0.5)
        self.assertIsNone(watcher.extensions)
    
    def test_initialization_with_custom_debounce(self):
        """Test initialization with custom debounce interval."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir, debounce_interval=1.0)
        self.assertEqual(watcher.debounce_interval, 1.0)
    
    def test_initialization_with_extensions(self):
        """Test initialization with extension filter."""
        from async_file_watcher import AsyncFileWatcher
        extensions = [".py", ".txt"]
        watcher = AsyncFileWatcher(self.test_dir, extensions=extensions)
        self.assertEqual(watcher.extensions, extensions)
    
    def test_initialization_with_all_parameters(self):
        """Test initialization with all parameters specified."""
        from async_file_watcher import AsyncFileWatcher
        extensions = [".md", ".html", ".css"]
        watcher = AsyncFileWatcher(
            self.test_dir,
            debounce_interval=0.3,
            extensions=extensions
        )
        self.assertEqual(watcher.debounce_interval, 0.3)
        self.assertEqual(watcher.extensions, extensions)
    
    def test_initialization_nonexistent_directory_raises_error(self):
        """Test that initializing with non-existent directory raises ValueError."""
        from async_file_watcher import AsyncFileWatcher
        with self.assertRaises(ValueError) as ctx:
            AsyncFileWatcher("/nonexistent/path/that/does/not/exist")
        self.assertIn("does not exist", str(ctx.exception))
    
    def test_initialization_file_instead_of_directory_raises_error(self):
        """Test that initializing with file path raises ValueError."""
        from async_file_watcher import AsyncFileWatcher
        # Create a file instead of directory
        file_path = os.path.join(self.test_dir, "test_file.txt")
        Path(file_path).touch()
        
        with self.assertRaises(ValueError) as ctx:
            AsyncFileWatcher(file_path)
        self.assertIn("not a directory", str(ctx.exception))
    
    def test_initialization_stores_absolute_path(self):
        """Test that initialization stores absolute path."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        self.assertTrue(os.path.isabs(watcher.directory))


class TestOnChangeCallback(unittest.TestCase):
    """Test cases for on_change callback registration."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_on_change_registers_callback(self):
        """Test that on_change properly registers callbacks."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        
        def callback(path, event):
            pass
        
        watcher.on_change(callback)
        self.assertEqual(len(watcher._callbacks), 1)
        self.assertIn(callback, watcher._callbacks)
    
    def test_on_change_registers_multiple_callbacks(self):
        """Test that multiple callbacks can be registered."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        
        callbacks = [lambda p, e: None for _ in range(3)]
        for cb in callbacks:
            watcher.on_change(cb)
        
        self.assertEqual(len(watcher._callbacks), 3)
    
    def test_on_change_accepts_lambda(self):
        """Test that on_change accepts lambda functions."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        watcher.on_change(lambda path, event: None)
        self.assertEqual(len(watcher._callbacks), 1)
    
    def test_on_change_accepts_async_callback(self):
        """Test that on_change accepts async callbacks."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        
        async def async_callback(path, event):
            pass
        
        watcher.on_change(async_callback)
        self.assertEqual(len(watcher._callbacks), 1)


class TestStopMethod(unittest.TestCase):
    """Test cases for stop method."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_stop_sets_running_to_false(self):
        """Test that stop() sets _running flag to False."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        watcher._running = True
        watcher.stop()
        self.assertFalse(watcher._running)
    
    def test_stop_before_start_does_not_raise(self):
        """Test that calling stop before start doesn't raise an exception."""
        from async_file_watcher import AsyncFileWatcher
        watcher = AsyncFileWatcher(self.test_dir)
        watcher.stop()  # Should not raise


class TestAsyncContextManager(unittest.TestCase):
    """Test async context manager protocol."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_async_context_manager_enter(self):
        """Test async context manager __aenter__."""
        from async_file_watcher import AsyncFileWatcher
        
        async def test_context():
            async with AsyncFileWatcher(self.test_dir) as watcher:
                self.assertIsInstance(watcher, AsyncFileWatcher)
                return True
        
        result = asyncio.run(test_context())
        self.assertTrue(result)
    
    def test_async_context_manager_exit_cleanup(self):
        """Test that context manager cleans up on exit."""
        from async_file_watcher import AsyncFileWatcher
        
        watcher_ref = None
        
        async def test_context():
            nonlocal watcher_ref
            async with AsyncFileWatcher(self.test_dir) as watcher:
                watcher_ref = watcher
            return watcher_ref
        
        watcher = asyncio.run(test_context())
        self.assertFalse(watcher._running)


class TestFileChangeDetection(unittest.TestCase):
    """Test file change detection functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_detects_file_creation(self):
        """Test that file creation is detected."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Create a file
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
        
        # Create file before starting watcher
        file_path = os.path.join(self.test_dir, "existing_file.txt")
        with open(file_path, 'w') as f:
            f.write("initial content")
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Modify the file
            with open(file_path, 'a') as f:
                f.write(" modified content")
            
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
        
        # Create file before starting watcher
        file_path = os.path.join(self.test_dir, "to_delete.txt")
        with open(file_path, 'w') as f:
            f.write("content")
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Delete the file
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
    
    def test_callback_receives_correct_arguments(self):
        """Test that callback receives file_path and event_type."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda path, event: events.append((path, event)))
            
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
        
        self.assertTrue(len(events) > 0)
        path, event_type = events[0]
        self.assertIsInstance(path, str)
        self.assertIsInstance(event_type, str)
        self.assertIn(event_type, ["modified", "created", "deleted"])


class TestExtensionFiltering(unittest.TestCase):
    """Test file extension filtering functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_filters_by_extension(self):
        """Test that only files with matching extensions trigger callbacks."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(
                self.test_dir, 
                debounce_interval=0.1,
                extensions=[".py"]
            )
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Create .py file (should trigger)
            py_file = os.path.join(self.test_dir, "test.py")
            with open(py_file, 'w') as f:
                f.write("print('hello')")
            
            # Create .txt file (should NOT trigger)
            txt_file = os.path.join(self.test_dir, "test.txt")
            with open(txt_file, 'w') as f:
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
    
    def test_no_filter_watches_all_files(self):
        """Test that without extension filter, all files are watched."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Create files with different extensions
            for ext in [".py", ".txt", ".json"]:
                file_path = os.path.join(self.test_dir, f"test{ext}")
                with open(file_path, 'w') as f:
                    f.write("content")
                await asyncio.sleep(0.15)
            
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
    
    def test_multiple_extensions_filter(self):
        """Test filtering with multiple extensions."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        async def run_test():
            watcher = AsyncFileWatcher(
                self.test_dir, 
                debounce_interval=0.1,
                extensions=[".md", ".html", ".css"]
            )
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Create matching files
            for ext in [".md", ".html", ".css"]:
                file_path = os.path.join(self.test_dir, f"test{ext}")
                with open(file_path, 'w') as f:
                    f.write("content")
                await asyncio.sleep(0.15)
            
            # Create non-matching file
            json_file = os.path.join(self.test_dir, "config.json")
            with open(json_file, 'w') as f:
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
        # Should not include .json
        self.assertFalse(any(".json" in p for p in paths))


class TestRecursiveWatching(unittest.TestCase):
    """Test recursive directory watching."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_watches_subdirectories(self):
        """Test that files in subdirectories are detected."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        # Create subdirectory structure
        subdir = os.path.join(self.test_dir, "subdir", "nested")
        os.makedirs(subdir)
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Create file in nested subdirectory
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
        self.assertTrue(any("nested_file.txt" in p for p in paths))
    
    def test_watches_components_directory(self):
        """Test watching nested components like /project/src/components/header.html."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        # Create nested structure like in the requirements
        components_dir = os.path.join(self.test_dir, "src", "components")
        os.makedirs(components_dir)
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Create file in components subdirectory
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


class TestDebouncing(unittest.TestCase):
    """Test debouncing functionality."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_debounces_rapid_changes(self):
        """Test that rapid changes to same file result in single callback."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        file_path = os.path.join(self.test_dir, "rapid_change.txt")
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.3)
            watcher.on_change(lambda path, event: events.append((path, event)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Rapid successive writes (faster than debounce interval)
            for i in range(5):
                with open(file_path, 'w') as f:
                    f.write(f"content {i}")
                await asyncio.sleep(0.05)  # 50ms between writes, less than 300ms debounce
            
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
        
        # Should have significantly fewer callbacks than writes
        file_events = [e for e in events if "rapid_change.txt" in e[0]]
        self.assertLessEqual(len(file_events), 2)
    
    def test_debounce_interval_respected(self):
        """Test that callback fires after debounce interval."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        event_times = []
        
        def timed_callback(path, event):
            import time
            events.append((path, event))
            event_times.append(time.time())
        
        async def run_test():
            import time
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.2)
            watcher.on_change(timed_callback)
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            # Record time of file creation
            start_time = time.time()
            file_path = os.path.join(self.test_dir, "timed.txt")
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
            
            return start_time
        
        start_time = asyncio.run(run_test())
        
        if event_times:
            # Callback should have been delayed by approximately debounce_interval
            elapsed = event_times[0] - start_time
            self.assertGreaterEqual(elapsed, 0.15)  # Allow some tolerance


class TestMultipleCallbacks(unittest.TestCase):
    """Test multiple callback handling."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_invokes_all_callbacks(self):
        """Test that all registered callbacks are invoked."""
        from async_file_watcher import AsyncFileWatcher
        
        events1 = []
        events2 = []
        events3 = []
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(lambda p, e: events1.append((p, e)))
            watcher.on_change(lambda p, e: events2.append((p, e)))
            watcher.on_change(lambda p, e: events3.append((p, e)))
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.3)
            
            file_path = os.path.join(self.test_dir, "multi_callback.txt")
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
        
        # All callbacks should have been invoked
        self.assertTrue(len(events1) > 0)
        self.assertTrue(len(events2) > 0)
        self.assertTrue(len(events3) > 0)
    
    def test_callback_exception_does_not_stop_others(self):
        """Test that one callback failure doesn't stop other callbacks."""
        from async_file_watcher import AsyncFileWatcher
        
        events = []
        
        def failing_callback(path, event):
            raise Exception("Intentional failure")
        
        def working_callback(path, event):
            events.append((path, event))
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            watcher.on_change(failing_callback)
            watcher.on_change(working_callback)
            
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
        
        # Working callback should still have been invoked
        self.assertTrue(len(events) > 0)


class TestResourceCleanup(unittest.TestCase):
    """Test resource cleanup."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_cleanup_after_stop(self):
        """Test that resources are cleaned up after stop."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.2)
            
            watcher.stop()
            await asyncio.sleep(0.2)
            
            # Verify cleanup
            self.assertIsNone(watcher._observer)
            self.assertEqual(len(watcher._debounce_tasks), 0)
            
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        asyncio.run(run_test())
    
    def test_stop_exits_cleanly_without_exception(self):
        """Test that stop causes start to exit without raising exceptions."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir, debounce_interval=0.1)
            
            async def start_and_stop():
                task = asyncio.create_task(watcher.start())
                await asyncio.sleep(0.2)
                watcher.stop()
                await asyncio.sleep(0.2)
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            # Should not raise any exceptions
            await start_and_stop()
            return True
        
        result = asyncio.run(run_test())
        self.assertTrue(result)


class TestStartMethod(unittest.TestCase):
    """Test start method behavior."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.test_dir = tempfile.mkdtemp()
        
    def tearDown(self):
        """Clean up test fixtures."""
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)
    
    def test_start_is_awaitable(self):
        """Test that start() is awaitable."""
        from async_file_watcher import AsyncFileWatcher
        
        async def run_test():
            watcher = AsyncFileWatcher(self.test_dir)
            
            task = asyncio.create_task(watcher.start())
            await asyncio.sleep(0.1)
            
            # If we get here without error, start() is awaitable
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
        
        # Other task should have been able to run
        self.assertTrue(other_task_ran)


if __name__ == '__main__':
    unittest.main()