# Trajectory: Async File Watcher with Debouncing and Extension Filtering

## 1. Audit the Requirements (Identify Core Challenges)

Analyzed the task requirements to identify the key engineering challenges:

- **Async-Sync Bridge Problem**: Watchdog library operates synchronously in its own thread, but we need async callbacks in the main event loop
- **Debouncing Complexity**: Rapid file changes (like IDE auto-saves) should be coalesced into single callbacks to prevent callback flooding
- **Resource Management**: File system watchers hold OS resources that must be properly cleaned up to prevent leaks
- **Extension Filtering**: Only specific file types should trigger callbacks for performance and relevance
- **Recursive Directory Watching**: Must detect changes in nested subdirectories like `/project/src/components/header.html`
- **Multiple Callback Support**: Multiple handlers should be able to register for the same file events
- **Context Manager Protocol**: Should support async `with` statements for clean resource management
- **Thread Safety**: Bridging between watchdog's observer thread and asyncio's event loop safely

## 2. Define Technical Contract

Established strict requirements based on the 51 test cases:

1. **Async Context Manager**: Implement `__aenter__` and `__aexit__` for clean resource management
2. **Input Validation**: Raise `ValueError` for non-existent directories or file paths instead of directories
3. **Extension Filtering**: Support optional list of extensions like `[".md", ".html", ".css"]`
4. **Debouncing**: Configurable interval (default 0.5s) to coalesce rapid changes
5. **Event Detection**: Detect file creation, modification, and deletion events
6. **Recursive Watching**: Monitor all subdirectories automatically
7. **Multiple Callbacks**: Support registering multiple sync/async callback functions
8. **Error Isolation**: One callback failure shouldn't prevent others from executing
9. **Clean Shutdown**: `stop()` method should cleanly terminate without exceptions
10. **Thread-Safe Communication**: Safe bridging between watchdog thread and asyncio loop

## 3. Design Architecture Strategy

Chose a **Thread-Safe Queue Bridge Pattern** to solve the async-sync integration:

### Core Components:
- **AsyncEventHandler**: Custom watchdog handler that runs in observer thread
- **AsyncFileWatcher**: Main async class that manages the event loop integration
- **Queue-Based Communication**: `asyncio.Queue` with `loop.call_soon_threadsafe()` for thread safety
- **Debouncing Engine**: Per-file task cancellation and rescheduling system

### Key Design Decisions:
- **Watchdog Integration**: Use `watchdog.Observer` for reliable cross-platform file system monitoring
- **Thread Communication**: `loop.call_soon_threadsafe()` ensures safe communication from observer thread to event loop
- **Debouncing Strategy**: Per-file `asyncio.Task` cancellation prevents callback flooding
- **Resource Cleanup**: Explicit cleanup in `_cleanup()` method with observer thread joining
- **Extension Matching**: Simple suffix matching for performance (no regex overhead)

## 4. Implement Thread-Safe Event Bridge

Built the critical `AsyncEventHandler` class in `repository_after/async_file_watcher.py`:

This design ensures:
- **Thread Safety**: `call_soon_threadsafe()` safely bridges threads
- **Directory Filtering**: Ignores directory events, only watches files
- **Extension Filtering**: Early filtering reduces queue traffic
- **Event Type Mapping**: Maps watchdog events to simple strings

## 5. Implement Debouncing Engine

Created a per-file debouncing system using `asyncio.Task` cancellation:

Key features:
- **Per-File Debouncing**: Each file has independent debounce timing
- **Task Cancellation**: Rapid changes cancel previous tasks
- **Latest Event Wins**: Only the most recent event type is preserved
- **Memory Management**: Completed tasks are removed from tracking dictionaries

## 6. Implement Async Context Manager Protocol

Built proper async context manager support:

## 7. Implement Resource Cleanup Strategy

Designed comprehensive cleanup in `_cleanup()` method:

Cleanup ensures:
- **Observer Thread Termination**: Proper thread joining with timeout
- **Task Cancellation**: All pending debounce tasks are cancelled
- **Memory Cleanup**: All tracking dictionaries are cleared
- **Resource Release**: OS file system watching resources are freed

## 8. Write Comprehensive Test Suite

Created 51 test cases covering all requirements in `tests/test_async_file_watcher.py`:

### Test Categories by Requirement:
- **Requirement 1 - Initialization**: Class existence, parameter storage, default values, custom configuration
- **Requirement 2 - Start Method**: Async method verification, awaitable behavior, event loop yielding, indefinite running
- **Requirement 3 - Stop Method**: Method existence, clean termination, exception handling, stop-before-start safety
- **Requirement 4 - Callback Registration**: `on_change()` method, multiple callbacks, proper invocation, argument passing
- **Requirement 5 - Debouncing**: Interval timing, rapid change coalescing, callback reduction
- **Requirement 6 - Recursive Watching**: Subdirectory monitoring, nested component detection (e.g., `/project/src/components/header.html`)
- **Requirement 7 - Extension Filtering**: Selective file watching, multiple extensions, no-filter behavior
- **Requirement 8 - Watchdog Integration**: Library imports, Observer usage, EventHandler inheritance, event method overrides
- **Requirement 9 - Directory Validation**: ValueError for non-existent paths, file vs directory validation, clear error messages
- **Requirement 10 - Thread Safety**: `asyncio.Queue` usage, `call_soon_threadsafe()` implementation, cross-thread communication
- **Requirement 11 - Resource Cleanup**: Context manager protocol, observer termination, task cancellation, memory cleanup
- **Dependency Setup**: Library availability verification, import testing

### Key Test Patterns:
- **Requirement-Based Organization**: Tests grouped by specific functional requirements for traceability
- **Async Test Harness**: All tests use `asyncio.run()` for proper async testing
- **Temporary Directories**: Each test creates isolated `tempfile.mkdtemp()` environments
- **Task Management**: Proper task creation, cancellation, and cleanup in tests
- **Timing Control**: Careful sleep intervals to ensure debouncing behavior
- **Thread Safety Verification**: Explicit testing of cross-thread communication mechanisms
- **Event Verification**: Checking callback arguments and event types

## 9. Configure Development Environment

Updated project configuration:

- **requirements.txt**: `watchdog>=3.0.0` for file system monitoring, `asyncio-extras>=1.3.0` for enhanced async utilities
- **__init__.py**: Clean module interface exposing `AsyncFileWatcher` and `AsyncEventHandler`
- **Dockerfile**: Python 3.11 environment with proper dependency installation
- **Module Structure**: Single-file implementation for simplicity while maintaining clean interfaces

## 10. Verification and Results

Final verification confirmed all requirements met:

- **Total Tests**: 51/51 passed (100% success rate)
- **Requirements Met**: All 11 functional requirements plus dependency verification
- **Performance**: Efficient debouncing prevents callback flooding
- **Thread Safety**: Safe communication between watchdog and asyncio verified through explicit testing
- **Resource Management**: Clean startup and shutdown with proper cleanup
- **Cross-Platform**: Uses watchdog for reliable file system monitoring
- **Test Coverage**: Comprehensive requirement-based test organization with 51 test cases

## Core Principle Applied

**Thread-Safe Async Bridge → Debouncing → Resource Management**

The trajectory followed an integration-first approach:

- **Audit** identified the async-sync bridge as the core technical challenge
- **Contract** established strict requirements for thread safety and resource cleanup
- **Design** used `asyncio.Queue` and `call_soon_threadsafe()` as the bridge mechanism
- **Execute** implemented per-file debouncing with task cancellation for performance
- **Verify** confirmed 100% test success with comprehensive requirement-based testing (51/51 tests)

The solution successfully bridges synchronous file system monitoring with asynchronous callback execution while maintaining high performance through intelligent debouncing and proper resource management. The implementation provides a clean, Pythonic API that integrates seamlessly with modern async/await codebases.